import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { PointsService } from '../points/points.service.js';
import { RewardsService } from '../rewards/rewards.service.js';
import type { ClientIdentity } from './client-access.guard.js';
import { expireDelivery } from './delivery-expiry.js';
import { ParticipantsService } from './participants.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { ReceiptStorageService } from './receipt-storage.service.js';
import { TransfersRepository } from './repositories/transfers.repository.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';

export type ReceiptFile = { buffer: Buffer; mimetype: string; size: number };
type TransferActor = { userId?: string; guestSessionId?: string };

@Injectable()
export class TransfersService {
  constructor(
    private readonly db: DataSource,
    private readonly keys: ParticipationIdempotencyService,
    private readonly storage: ReceiptStorageService,
    private readonly participants: ParticipantsService,
    private readonly points: PointsService,
    private readonly rewards: RewardsService,
    private readonly persistence: TransfersRepository = new TransfersRepository(),
  ) {}

  private async staff(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
    permission: string,
  ) {
    const [s] = await this.persistence.staffFindUsuario(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
    if (!s || !s.activo || s.revocada_en || !s.valid)
      throw new UnauthorizedException('Sesión no válida.');
    const [p] = await this.persistence.staffFindUsuarioNext(m, {
      userId: actor.userId,
      permission: permission,
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
            const [own] = await this.persistence.uploadFindLiquidacion(m, {
              id: id,
              clientId: client.clientId,
            });
            if (!own) throw new NotFoundException('Liquidación no encontrada.');
          }
          if (staff) await this.staff(m, staff, 'payments.registerTransfer');
        },
        async (m) => {
          const zone = await lockTableOperations(m);
          const [ref] = await this.persistence.uploadFindLiquidacionNext(m, {
            id: id,
          });
          if (!ref) throw new NotFoundException('Liquidación no encontrada.');
          const [cash] = await this.persistence.uploadFindCaja(m, {
            id_caja: ref.id_caja,
            zone: zone,
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
          const [account] = await this.persistence.uploadFindCuentaConsumo(m, {
            id_cuenta: ref.id_cuenta,
          });
          const [settlement] =
            await this.persistence.uploadFindLiquidacionNextNext(m, { id: id });
          if (
            account.estado !== 'open' ||
            settlement.estado !== 'pending' ||
            !Number.isSafeInteger(settlement.total) ||
            settlement.total <= 0
          )
            throw new ConflictException(
              'La liquidación no admite transferencias.',
            );
          const [pending] = await this.persistence.uploadFindPago(m, {
            id: id,
          });
          if (pending)
            throw new ConflictException(
              'Ya existe una transferencia pendiente.',
            );
          const [expired] = await this.persistence.uploadFindEntregaDomicilio(
            m,
            { id_cuenta: ref.id_cuenta },
          );
          if (expired)
            throw new ConflictException(
              'El plazo para presentar el comprobante vencio.',
            );
          uploaded = this.storage.prefix + randomUUID();
          await this.storage.put(uploaded, file.buffer, mime);
          const [payment] = await this.persistence.uploadInsertPago(m, {
            id: id,
            total: settlement.total,
            userId: actor.userId ?? null,
            guestSessionId: actor.guestSessionId ?? null,
            id_cliente: ref.id_cliente,
          });
          await this.persistence.uploadInsertComprobante(m, {
            id: payment.id,
            uploaded: uploaded,
            mime: mime,
            length: file.buffer.length,
            hash: hash,
          });
          await this.persistence.uploadInsertHistorialPago(m, {
            id: payment.id,
            userId: actor.userId ?? null,
            guestSessionId: actor.guestSessionId ?? null,
          });
          await auditTableOperation(
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
          const [referenced] = await this.persistence.uploadFindComprobante(
            this.db.manager,
            { uploaded: uploaded },
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
          const zone = await lockTableOperations(m);
          const [ref] = await this.persistence.decideFindPago(m, { id: id });
          if (!ref) throw new NotFoundException('Pago no encontrado.');
          if (decision === 'confirm') {
            const [cash] = await this.persistence.uploadFindCaja(m, {
              id_caja: ref.id_caja,
              zone: zone,
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
          await this.persistence.decideFindVisitaMesa(m, {
            id_visita: ref.id_visita,
          });
          const [participant] = await this.persistence.decideFindParticipante(
            m,
            { id_participante: ref.id_participante },
          );
          const [account] = await this.persistence.uploadFindCuentaConsumo(m, {
            id_cuenta: ref.id_cuenta,
          });
          const [settlement] = await this.persistence.decideFindLiquidacion(m, {
            id_liquidacion: ref.id_liquidacion,
          });
          const [payment] = await this.persistence.decideFindPagoNext(m, {
            id: id,
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
          await this.persistence.decideUpdatePago(m, {
            id: id,
            status: status,
            userId: actor.userId,
            bankOperationReference: decision === 'confirm' ? normalized : null,
            rejectionReason: decision === 'reject' ? normalized : null,
          });
          if (decision === 'confirm') {
            await this.points.recordConfirmedPayment(m, id);
            await this.persistence.decideUpdateLiquidacion(m, {
              id_liquidacion: ref.id_liquidacion,
              userId: actor.userId,
            });
            if (ref.modalidad === 'local')
              await this.persistence.decideUpdateCuentaConsumo(m, {
                id_cuenta: ref.id_cuenta,
              });
            if (ref.modalidad === 'local')
              await this.rewards.releaseForParticipant(m, ref.id_participante);
            if (ref.modalidad === 'local')
              await this.persistence.decideUpdateParticipante(m, {
                id_participante: ref.id_participante,
              });
          }
          if (decision === 'reject') {
            const [order] = await this.persistence.decideFindPedido(m, {
              id_cuenta: ref.id_cuenta,
            });
            if (order) await expireDelivery(m, order.id_pedido);
          }
          await this.persistence.decideInsertHistorialPago(m, {
            id: id,
            userId: actor.userId,
            status: status,
            event: `transfer.${decision}`,
          });
          await auditTableOperation(
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
                await this.persistence.decideFindLiquidacionNext(m, {
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
    const [row] = await this.persistence.receiptFindComprobante(
      this.db.manager,
      { id: id, clientId: clientId ?? null },
    );
    if (!row) throw new NotFoundException('Comprobante no encontrado.');
    return { mime: row.mime, body: await this.storage.get(row.key) };
  }
}
