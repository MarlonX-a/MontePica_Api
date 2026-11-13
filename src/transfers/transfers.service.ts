import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AccountLifecycleService } from '../accounts/account-lifecycle.service.js';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { type ClientIdentity } from '../common/identity/client-access.guard.js';
import { ReceiptStorageService } from '../common/storage/receipt-storage.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { DeliveryLifecycleService } from '../delivery/delivery-lifecycle.service.js';
import { DeliveryDetails } from '../delivery/entities/delivery-details.entity.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { PaymentHistory } from '../payments/entities/payment-history.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PointsLedgerService } from '../points/points-ledger.service.js';
import { RedemptionReservationsService } from '../redemptions/redemption-reservations.service.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { TableVisit } from '../visits/entities/table-visit.entity.js';
import { Receipt } from './entities/receipt.entity.js';
import {
  DecideFindLiquidacionNextRow,
  DecideFindLiquidacionRow,
  DecideFindPagoNextRow,
  DecideFindPagoRow,
  DecideFindParticipanteRow,
  DecideFindPedidoRow,
  ReceiptFindComprobanteRow,
  StaffFindUsuarioNextRow,
  StaffFindUsuarioRow,
  UploadFindCajaRow,
  UploadFindComprobanteRow,
  UploadFindCuentaConsumoRow,
  UploadFindEntregaDomicilioRow,
  UploadFindLiquidacionNextNextRow,
  UploadFindLiquidacionNextRow,
  UploadFindLiquidacionRow,
  UploadFindPagoRow,
  UploadInsertPagoRow,
} from './types/transfers.types.js';

export type ReceiptFile = { buffer: Buffer; mimetype: string; size: number };

type TransferActor = { userId?: string; guestSessionId?: string };

@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(Payment) private readonly records: Repository<Payment>,
    private readonly keys: ParticipationIdempotencyService,
    private readonly storage: ReceiptStorageService,
    private readonly participants: ParticipantsService,
    private readonly points: PointsLedgerService,
    private readonly rewards: RedemptionReservationsService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly deliveryLifecycle: DeliveryLifecycleService,
    private readonly authorization: AuthorizationService,
    private readonly accountLifecycle: AccountLifecycleService,
  ) {}

  private async staff(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
    permission: string,
  ) {
    const [s] = await this.staffFindUsuario(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
    if (!s || !s.activo || s.revocada_en || !s.valid)
      throw new UnauthorizedException('Sesión no válida.');
    const [p] = await this.staffFindUsuarioNext(m, {
      userId: actor.userId,
      permission,
    });
    if (!p)
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción.',
      );
  }

  private validate(file: ReceiptFile) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Se requiere un archivo.');
    if (file.buffer.length > 5242880)
      throw new BadRequestException('El archivo supera 5 MiB.');
    const b = file.buffer;
    const kind =
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
        ? 'image/jpeg'
        : b.length >= 8 &&
            b
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : b.subarray(0, 5).toString('ascii') === '%PDF-'
            ? 'application/pdf'
            : null;
    if (!kind || kind !== file.mimetype)
      throw new UnsupportedMediaTypeException(
        'El archivo debe ser JPEG, PNG o PDF válido.',
      );
    return { mime: kind, hash: createHash('sha256').update(b).digest('hex') };
  }

  async upload(
    id: string,
    file: ReceiptFile,
    actor: TransferActor,
    client: ClientIdentity | undefined,
    staff: AuthenticatedRequestContext | undefined,
    key?: string,
  ) {
    const { mime, hash } = this.validate(file);
    let uploaded: string | undefined;
    try {
      return await this.keys.run(
        actor,
        `settlements/${id.toLowerCase()}/transfer-payments`,
        key,
        { mime, sha256: hash, size: file.buffer.length },
        201,
        'pago',
        async (m) => {
          if (client) {
            await this.participants.authenticate(m, client);
            const [own] = await this.uploadFindLiquidacion(m, {
              id,
              clientId: client.clientId,
            });
            if (!own) throw new NotFoundException('Liquidación no encontrada.');
          }
          if (staff) await this.staff(m, staff, 'payments.registerTransfer');
        },
        async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const [ref] = await this.uploadFindLiquidacionNext(m, {
            id,
          });
          if (!ref) throw new NotFoundException('Liquidación no encontrada.');
          const [cash] = await this.uploadFindCaja(m, {
            id_caja: ref.id_caja,
            zone,
          });
          if (
            !cash ||
            cash.estado !== 'open' ||
            cash.day_status !== 'open' ||
            !cash.current
          )
            throw new ConflictException(
              'La caja debe estar abierta en la jornada actual.',
            );
          const [account] = await this.uploadFindCuentaConsumo(m, {
            id_cuenta: ref.id_cuenta,
          });
          const [settlement] = await this.uploadFindLiquidacionNextNext(m, {
            id,
          });
          if (
            account.estado !== 'open' ||
            settlement.estado !== 'pending' ||
            !Number.isSafeInteger(settlement.total) ||
            settlement.total <= 0
          )
            throw new ConflictException(
              'La liquidación no admite transferencias.',
            );
          const [pending] = await this.uploadFindPago(m, {
            id,
          });
          if (pending)
            throw new ConflictException(
              'Ya existe una transferencia pendiente.',
            );
          const [expired] = await this.uploadFindEntregaDomicilio(m, {
            id_cuenta: ref.id_cuenta,
          });
          if (expired)
            throw new ConflictException(
              'El plazo para presentar el comprobante vencio.',
            );
          uploaded = this.storage.prefix + randomUUID();
          await this.storage.put(uploaded, file.buffer, mime);
          const [payment] = await this.uploadInsertPago(m, {
            id,
            total: settlement.total,
            userId: actor.userId ?? null,
            guestSessionId: actor.guestSessionId ?? null,
            id_cliente: ref.id_cliente,
          });
          await this.uploadInsertComprobante(m, {
            id: payment.id,
            uploaded,
            mime,
            length: file.buffer.length,
            hash,
          });
          await this.uploadInsertHistorialPago(m, {
            id: payment.id,
            userId: actor.userId ?? null,
            guestSessionId: actor.guestSessionId ?? null,
          });
          await this.auditLog.append(
            m,
            actor,
            'pago',
            payment.id,
            'transfer.submitted',
            {
              settlementId: id,
              amountCents: settlement.total,
              mime,
              size: file.buffer.length,
            },
          );
          return {
            resourceId: payment.id,
            response: {
              id: payment.id,
              settlementId: id,
              method: 'transfer',
              status: 'pendingVerification',
              amountCents: settlement.total,
              receipt: { mime, size: file.buffer.length, sha256: hash },
            },
          };
        },
      );
    } catch (error) {
      if (uploaded) {
        try {
          const [referenced] = await this.uploadFindComprobante(
            this.records.manager,
            { uploaded },
          );
          if (!referenced) await this.storage.delete(uploaded);
        } catch {
          /* The orphan reconciliation command handles failed compensation. */
        }
      }
      throw error;
    }
  }

  async decide(
    id: string,
    decision: 'confirm' | 'reject',
    value: string,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    const normalized =
      decision === 'confirm'
        ? value.normalize('NFC').trim().toUpperCase()
        : value.trim();
    if (!normalized || normalized.length > (decision === 'confirm' ? 120 : 500))
      throw new BadRequestException('Referencia o motivo inválido.');
    try {
      return await this.keys.run(
        { userId: actor.userId },
        `payments/${id.toLowerCase()}/${decision}`,
        key,
        { value: normalized },
        200,
        'pago',
        (m) => this.staff(m, actor, 'payments.verify'),
        async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const [ref] = await this.decideFindPago(m, { id });
          if (!ref) throw new NotFoundException('Pago no encontrado.');
          if (decision === 'confirm') {
            const [cash] = await this.uploadFindCaja(m, {
              id_caja: ref.id_caja,
              zone,
            });
            if (
              !cash ||
              cash.estado !== 'open' ||
              cash.day_status !== 'open' ||
              !cash.current
            )
              throw new ConflictException(
                'La caja debe estar abierta en la jornada actual.',
              );
          }
          await this.decideFindVisitaMesa(m, {
            id_visita: ref.id_visita,
          });
          const [participant] = await this.decideFindParticipante(m, {
            id_participante: ref.id_participante,
          });
          const [account] = await this.uploadFindCuentaConsumo(m, {
            id_cuenta: ref.id_cuenta,
          });
          const [settlement] = await this.decideFindLiquidacion(m, {
            id_liquidacion: ref.id_liquidacion,
          });
          const [payment] = await this.decideFindPagoNext(m, {
            id,
          });
          if (
            payment.metodo !== 'transfer' ||
            payment.estado !== 'pendingVerification' ||
            settlement.estado !== 'pending' ||
            account.estado !== 'open' ||
            (ref.modalidad === 'local' && participant?.estado !== 'approved')
          )
            throw new ConflictException('El pago ya no está pendiente.');
          const status = decision === 'confirm' ? 'confirmed' : 'rejected';
          await this.decideUpdatePago(m, {
            id,
            status,
            userId: actor.userId,
            bankOperationReference: decision === 'confirm' ? normalized : null,
            rejectionReason: decision === 'reject' ? normalized : null,
          });
          if (decision === 'confirm') {
            await this.points.recordConfirmedPayment(m, id);
            await this.decideUpdateLiquidacion(m, {
              id_liquidacion: ref.id_liquidacion,
              userId: actor.userId,
            });
            if (ref.modalidad === 'local')
              await this.accountLifecycle.closeAccount(m, {
                id_cuenta: ref.id_cuenta,
              });
            if (ref.modalidad === 'local')
              await this.rewards.releaseForParticipant(m, ref.id_participante);
            if (ref.modalidad === 'local')
              await this.accountLifecycle.finishParticipant(m, {
                id_participante: ref.id_participante,
              });
          }
          if (decision === 'reject') {
            const [order] = await this.decideFindPedido(m, {
              id_cuenta: ref.id_cuenta,
            });
            if (order)
              await this.deliveryLifecycle.expireDelivery(m, order.id_pedido);
          }
          await this.decideInsertHistorialPago(m, {
            id,
            userId: actor.userId,
            status,
            event: `transfer.${decision}`,
          });
          await this.auditLog.append(
            m,
            { userId: actor.userId },
            'pago',
            id,
            `transfer.${decision}`,
            {
              settlementId: ref.id_liquidacion,
              reason: decision === 'reject' ? normalized : null,
            },
          );
          return {
            resourceId: id,
            response: {
              id,
              settlementId: ref.id_liquidacion,
              status,
              settlementStatus: (
                await this.decideFindLiquidacionNext(m, {
                  id_liquidacion: ref.id_liquidacion,
                })
              )[0].estado,
            },
          };
        },
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      )
        throw new ConflictException(
          'La referencia bancaria ya fue confirmada.',
        );
      throw error;
    }
  }

  async receipt(id: string, clientId?: string) {
    const [row] = await this.receiptFindComprobante(this.records.manager, {
      id,
      clientId: clientId ?? null,
    });
    if (!row) throw new NotFoundException('Comprobante no encontrado.');
    return { mime: row.mime, body: await this.storage.get(row.key) };
  }

  private async staffFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<StaffFindUsuarioRow[]> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
      undefined,
    );
    return row ? [row] : [];
  }

  private async staffFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string; permission: string },
  ): Promise<StaffFindUsuarioNextRow[]> {
    return (await this.authorization.hasPermission(
      manager,
      input.userId,
      input.permission,
    ))
      ? [{ '1': '1' }]
      : [];
  }

  private uploadFindLiquidacion(
    manager: EntityManager,
    input: { id: string; clientId: string },
  ): Promise<UploadFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('l')
      .select('1 AS "1"')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .where('l.id_liquidacion=:id AND c.id_cliente=:clientId')
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<UploadFindLiquidacionRow>();
  }

  private uploadFindLiquidacionNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UploadFindLiquidacionNextRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('l')
      .select('l.id_cuenta, l.id_caja, c.id_cliente')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .where('l.id_liquidacion=:id')
      .setParameters({ id: input.id })
      .getRawMany<UploadFindLiquidacionNextRow>();
  }

  private uploadFindCaja(
    manager: EntityManager,
    input: { id_caja: string; zone: string },
  ): Promise<UploadFindCajaRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('c')
      .select(
        'c.estado, j.estado AS day_status, j.fecha_operativa=timezone(:zone,clock_timestamp())::date AS current',
      )
      .innerJoin(OperatingDay, 'j', 'j.id_jornada=c.id_jornada')
      .where('c.id_caja=:id_caja')
      .setLock('pessimistic_write', undefined, ['j', 'c'])
      .setParameters({ id_caja: input.id_caja, zone: input.zone })
      .getRawMany<UploadFindCajaRow>();
  }

  private uploadFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<UploadFindCuentaConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('cuenta_consumo')
      .select('estado AS "estado"')
      .where('id_cuenta=:id_cuenta')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<UploadFindCuentaConsumoRow>();
  }

  private uploadFindLiquidacionNextNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UploadFindLiquidacionNextNextRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('estado, total_ctvs::float8 AS total')
      .where('id_liquidacion=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<UploadFindLiquidacionNextNextRow>();
  }

  private uploadFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UploadFindPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('pago')
      .select('1 AS "1"')
      .where("id_liquidacion=:id AND estado='pendingVerification'")
      .setParameters({ id: input.id })
      .getRawMany<UploadFindPagoRow>();
  }

  private uploadFindEntregaDomicilio(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<UploadFindEntregaDomicilioRow[]> {
    return manager
      .getRepository(DeliveryDetails)
      .createQueryBuilder('e')
      .select('1 AS "1"')
      .innerJoin(Order, 'o', 'o.id_pedido=e.id_pedido')
      .where(
        'o.id_cuenta=:id_cuenta AND e.comprobante_hasta<=clock_timestamp()',
      )
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<UploadFindEntregaDomicilioRow>();
  }

  private uploadInsertPago(
    manager: EntityManager,
    input: {
      id: string;
      total: number;
      userId: string | null;
      guestSessionId: string | null;
      id_cliente: string;
    },
  ): Promise<UploadInsertPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_liquidacion: input.id,
          metodo: 'transfer',
          estado: 'pendingVerification',
          importe_ctvs: String(input.total),
          registrado_usuario: input.userId,
          registrado_sesion_cliente: input.guestSessionId,
          pagador_cliente: input.id_cliente,
        },
      ])
      .returning('id_pago AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async uploadInsertComprobante(
    manager: EntityManager,
    input: {
      id: string;
      uploaded: string;
      mime: string;
      length: number;
      hash: string;
    },
  ): Promise<void> {
    await manager
      .getRepository(Receipt)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pago: input.id,
          archivo_privado: input.uploaded,
          mime: input.mime,
          tamano: input.length,
          sha256: input.hash,
        },
      ])
      .execute();
  }

  private async uploadInsertHistorialPago(
    manager: EntityManager,
    input: { id: string; userId: string | null; guestSessionId: string | null },
  ): Promise<void> {
    await manager
      .getRepository(PaymentHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pago: input.id,
          actor_usuario: input.userId,
          actor_sesion_cliente: input.guestSessionId,
          estado_nuevo: 'pendingVerification',
          evento: 'transfer.submitted',
        },
      ])
      .execute();
  }

  private uploadFindComprobante(
    manager: EntityManager,
    input: { uploaded: string },
  ): Promise<UploadFindComprobanteRow[]> {
    return manager
      .getRepository(Receipt)
      .createQueryBuilder('comprobante')
      .select('1 AS "1"')
      .where('archivo_privado=:uploaded')
      .setParameters({ uploaded: input.uploaded })
      .getRawMany<UploadFindComprobanteRow>();
  }

  private decideFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select(
        'p.id_liquidacion, l.id_cuenta, l.id_caja, c.id_participante, c.modalidad, part.id_visita',
      )
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .leftJoin(Participant, 'part', 'part.id_participante=c.id_participante')
      .where('p.id_pago=:id')
      .setParameters({ id: input.id })
      .getRawMany<DecideFindPagoRow>();
  }

  private async decideFindVisitaMesa(
    manager: EntityManager,
    input: { id_visita: string },
  ): Promise<void> {
    await manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select('1 AS "1"')
      .where('id_visita=:id_visita')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_visita: input.id_visita })
      .getRawMany();
  }

  private decideFindParticipante(
    manager: EntityManager,
    input: { id_participante: string },
  ): Promise<DecideFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select('estado AS "estado"')
      .where('id_participante=:id_participante')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_participante: input.id_participante })
      .getRawMany<DecideFindParticipanteRow>();
  }

  private decideFindLiquidacion(
    manager: EntityManager,
    input: { id_liquidacion: string },
  ): Promise<DecideFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('estado AS "estado"')
      .where('id_liquidacion=:id_liquidacion')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_liquidacion: input.id_liquidacion })
      .getRawMany<DecideFindLiquidacionRow>();
  }

  private decideFindPagoNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindPagoNextRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('pago')
      .select('estado, metodo')
      .where('id_pago=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<DecideFindPagoNextRow>();
  }

  private async decideUpdatePago(
    manager: EntityManager,
    input: {
      id: string;
      status: 'rejected' | 'confirmed';
      userId: string;
      bankOperationReference: string | null;
      rejectionReason: string | null;
    },
  ): Promise<void> {
    await manager
      .getRepository(Payment)
      .createQueryBuilder()
      .update(Payment)
      .set({
        estado: input.status,
        verificado_por: input.userId,
        verificado_en: () => 'clock_timestamp()',
        operacion_bancaria_confirmada: input.bankOperationReference,
        motivo_rechazo: input.rejectionReason,
      })
      .where('id_pago=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async decideUpdateLiquidacion(
    manager: EntityManager,
    input: { id_liquidacion: string; userId: string },
  ): Promise<void> {
    await manager
      .getRepository(Settlement)
      .createQueryBuilder()
      .update(Settlement)
      .set({
        estado: 'settled',
        cerrada_en: () => 'clock_timestamp()',
        cerrada_por: input.userId,
        resolucion: 'transfer',
      })
      .where('id_liquidacion=:id_liquidacion')
      .setParameters({ id_liquidacion: input.id_liquidacion })
      .execute();
  }

  private decideFindPedido(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<DecideFindPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('pedido')
      .select('id_pedido AS "id_pedido"')
      .where("id_cuenta=:id_cuenta AND modalidad='delivery'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<DecideFindPedidoRow>();
  }

  private async decideInsertHistorialPago(
    manager: EntityManager,
    input: {
      id: string;
      userId: string;
      status: 'rejected' | 'confirmed';
      event: string;
    },
  ): Promise<void> {
    await manager
      .getRepository(PaymentHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pago: input.id,
          actor_usuario: input.userId,
          estado_anterior: 'pendingVerification',
          estado_nuevo: input.status,
          evento: input.event,
        },
      ])
      .execute();
  }

  private decideFindLiquidacionNext(
    manager: EntityManager,
    input: { id_liquidacion: string },
  ): Promise<DecideFindLiquidacionNextRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('estado AS "estado"')
      .where('id_liquidacion=:id_liquidacion')
      .setParameters({ id_liquidacion: input.id_liquidacion })
      .getRawMany<DecideFindLiquidacionNextRow>();
  }

  private receiptFindComprobante(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<ReceiptFindComprobanteRow[]> {
    return manager
      .getRepository(Receipt)
      .createQueryBuilder('r')
      .select('r.archivo_privado AS key, r.mime')
      .innerJoin(Payment, 'p', 'p.id_pago=r.id_pago')
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .where(
        'p.id_pago=:id AND (:clientId::uuid IS NULL OR c.id_cliente=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<ReceiptFindComprobanteRow>();
  }
}
