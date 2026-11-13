import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountLifecycleService } from '../accounts/account-lifecycle.service.js';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { PointsLedgerService } from '../points/points-ledger.service.js';
import { RedemptionReservationsService } from '../redemptions/redemption-reservations.service.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { Receipt } from '../transfers/entities/receipt.entity.js';
import { TableVisit } from '../visits/entities/table-visit.entity.js';
import { type AdminPaymentListDto } from './dto/admin-payment-list.dto.js';
import { type PaymentListDto } from './dto/payment-list.dto.js';
import { PaymentHistory } from './entities/payment-history.entity.js';
import { Payment } from './entities/payment.entity.js';
import {
  AuthorizeFindUsuarioNextRow,
  AuthorizeFindUsuarioRow,
  CollectFindCajaRow,
  CollectFindCuentaConsumoRow,
  CollectFindLiquidacionNextRow,
  CollectFindLiquidacionRow,
  CollectFindPagoRow,
  CollectFindParticipanteRow,
  CollectInsertPagoRow,
  DetailFindComprobanteRow,
  DetailFindDevolucionRow,
  DetailFindHistorialPagoRow,
  DetailFindPagoRow,
} from './types/payments.types.js';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly records: Repository<Payment>,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly points: PointsLedgerService,
    private readonly rewards: RedemptionReservationsService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
    private readonly accountLifecycle: AccountLifecycleService,
  ) {}

  private async authorize(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
  ) {
    const [session] = await this.authorizeFindUsuario(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
    if (!session || !session.activo || session.revocada_en || !session.valid)
      throw new UnauthorizedException('Sesión no válida.');
    const [permission] = await this.authorizeFindUsuarioNext(m, {
      userId: actor.userId,
    });
    if (!permission)
      throw new ForbiddenException('No tienes permiso para cobrar.');
  }

  async collect(
    id: string,
    receivedCents: number | null,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    const zero = receivedCents === null;
    return this.idempotency.run(
      { userId: actor.userId },
      `settlements/${id.toLowerCase()}/${zero ? 'complete-without-payment' : 'cash-payments'}`,
      key,
      zero ? {} : { receivedCents },
      zero ? 200 : 201,
      'liquidacion',
      (m) => this.authorize(m, actor),
      async (m) => {
        const zone = await this.operationalContext.lockTableOperations(m);
        const [ref] = await this.collectFindLiquidacion(m, {
          id,
        });
        if (!ref) throw new NotFoundException('Liquidación no encontrada.');
        if (ref.modalidad === 'delivery')
          throw new ConflictException(
            'Los domicilios requieren transferencia.',
          );
        const [cash] = await this.collectFindCaja(m, {
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
        await this.collectFindVisitaMesa(m, {
          id_visita: ref.id_visita,
        });
        const [participant] = await this.collectFindParticipante(m, {
          id_participante: ref.id_participante,
        });
        const [account] = await this.collectFindCuentaConsumo(m, {
          id_cuenta: ref.id_cuenta,
        });
        const [settlement] = await this.collectFindLiquidacionNext(m, {
          id,
        });
        if (
          settlement.estado !== 'pending' ||
          account.estado !== 'open' ||
          participant.estado !== 'approved'
        )
          throw new ConflictException(
            'La liquidación, cuenta o participación ya no están disponibles.',
          );
        const [pendingTransfer] = await this.collectFindPago(m, {
          id,
        });
        if (pendingTransfer)
          throw new ConflictException(
            'Existe una transferencia pendiente de verificación.',
          );
        if (
          !Number.isSafeInteger(settlement.total) ||
          (zero
            ? settlement.total !== 0
            : settlement.total <= 0 || receivedCents! < settlement.total)
        )
          throw new ConflictException(
            'Importe insuficiente o liquidación incompatible.',
          );
        let payment = null;
        if (!zero) {
          const [created] = await this.collectInsertPago(m, {
            id,
            total: settlement.total,
            receivedCents,
            changeCents: receivedCents! - settlement.total,
            userId: actor.userId,
          });
          await this.collectInsertHistorialPago(m, {
            id: created.id,
            userId: actor.userId,
          });
          await this.points.recordConfirmedPayment(m, created.id);
          payment = await this.detail(created.id, undefined, true, m);
        }
        await this.collectUpdateLiquidacion(m, {
          id,
          userId: actor.userId,
          resolution: zero ? 'zeroTotal' : 'cash',
        });
        await this.accountLifecycle.closeAccount(m, {
          id_cuenta: ref.id_cuenta,
        });
        await this.rewards.releaseForParticipant(m, ref.id_participante);
        await this.accountLifecycle.finishParticipant(m, {
          id_participante: ref.id_participante,
        });
        await this.auditLog.append(
          m,
          { userId: actor.userId },
          'liquidacion',
          id,
          zero ? 'settlement.zero_completed' : 'payment.confirmed',
          {
            paymentId: payment?.id ?? null,
            accountId: ref.id_cuenta,
            totalCents: settlement.total,
          },
        );
        return {
          resourceId: id,
          response: {
            payment,
            settlement: { id, status: 'settled' },
            account: { id: ref.id_cuenta, status: 'closed' },
            participant: { id: ref.id_participante, status: 'finished' },
          },
        };
      },
    );
  }

  async detail(
    id: string,
    clientId?: string,
    admin = false,
    m: EntityManager = this.records.manager,
  ) {
    const [payment] = await this.detailFindDevolucion(m, {
      id,
      clientId: clientId ?? null,
    });
    if (!payment) throw new NotFoundException('Pago no encontrado.');
    const [receipt] = await this.detailFindComprobante(m, {
      id,
    });
    payment.receipt = receipt ?? null;
    if (admin) {
      const [registrar] = await this.detailFindPago(m, { id });
      payment.registeredBy = registrar.registeredBy;
      payment.registeredByGuestSessionId = registrar.registeredByGuestSessionId;
      payment.verifiedBy = registrar.verifiedBy;
      payment.bankOperationReference = registrar.bankOperationReference;
      payment.history = await this.detailFindHistorialPago(m, {
        id,
      });
    }
    return payment;
  }

  async list(query: PaymentListDto, clientId?: string) {
    const { rows, total } = await this.listPaymentIds(
      this.records.manager,
      query,
      clientId,
    );
    return {
      items: await Promise.all(
        rows.map((row) => this.detail(row.id, clientId)),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private async authorizeFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizeFindUsuarioRow[]> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
      undefined,
    );
    return row ? [row] : [];
  }

  private async authorizeFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string },
  ): Promise<AuthorizeFindUsuarioNextRow[]> {
    return (await this.authorization.hasPermission(
      manager,
      input.userId,
      'payments.collect',
    ))
      ? [{ '1': '1' }]
      : [];
  }

  private collectFindLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CollectFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('l')
      .select(
        'l.id_cuenta, c.id_participante, c.modalidad, p.id_visita, l.id_caja',
      )
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .leftJoin(Participant, 'p', 'p.id_participante=c.id_participante')
      .where('l.id_liquidacion=:id')
      .setParameters({ id: input.id })
      .getRawMany<CollectFindLiquidacionRow>();
  }

  private collectFindCaja(
    manager: EntityManager,
    input: { id_caja: string; zone: string },
  ): Promise<CollectFindCajaRow[]> {
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
      .getRawMany<CollectFindCajaRow>();
  }

  private async collectFindVisitaMesa(
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

  private collectFindParticipante(
    manager: EntityManager,
    input: { id_participante: string },
  ): Promise<CollectFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select('estado AS "estado"')
      .where('id_participante=:id_participante')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_participante: input.id_participante })
      .getRawMany<CollectFindParticipanteRow>();
  }

  private collectFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<CollectFindCuentaConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('cuenta_consumo')
      .select('estado AS "estado"')
      .where('id_cuenta=:id_cuenta')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<CollectFindCuentaConsumoRow>();
  }

  private collectFindLiquidacionNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CollectFindLiquidacionNextRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('estado, total_ctvs::float8 AS total')
      .where('id_liquidacion=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<CollectFindLiquidacionNextRow>();
  }

  private collectFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CollectFindPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('pago')
      .select('1 AS "1"')
      .where(
        "id_liquidacion=:id AND metodo='transfer' AND estado='pendingVerification'",
      )
      .setParameters({ id: input.id })
      .getRawMany<CollectFindPagoRow>();
  }

  private collectInsertPago(
    manager: EntityManager,
    input: {
      id: string;
      total: number;
      receivedCents: number;
      changeCents: number;
      userId: string;
    },
  ): Promise<CollectInsertPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_liquidacion: input.id,
          metodo: 'cash',
          estado: 'confirmed',
          importe_ctvs: String(input.total),
          recibido_ctvs:
            input.receivedCents === null ? null : String(input.receivedCents),
          cambio_ctvs:
            input.changeCents === null ? null : String(input.changeCents),
          registrado_usuario: input.userId,
        },
      ])
      .returning('id_pago AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async collectInsertHistorialPago(
    manager: EntityManager,
    input: { id: string; userId: string },
  ): Promise<void> {
    await manager
      .getRepository(PaymentHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pago: input.id,
          actor_usuario: input.userId,
          estado_nuevo: 'confirmed',
          evento: 'payment.confirmed',
        },
      ])
      .execute();
  }

  private async collectUpdateLiquidacion(
    manager: EntityManager,
    input: { id: string; userId: string; resolution: 'cash' | 'zeroTotal' },
  ): Promise<void> {
    await manager
      .getRepository(Settlement)
      .createQueryBuilder()
      .update(Settlement)
      .set({
        estado: 'settled',
        cerrada_en: () => 'clock_timestamp()',
        cerrada_por: input.userId,
        resolucion: input.resolution,
      })
      .where('id_liquidacion=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private detailFindDevolucion(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<DetailFindDevolucionRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select([
        'p.id_pago AS id',
        'p.id_liquidacion AS "settlementId"',
        'l.id_cuenta AS "accountId"',
        'l.id_caja AS "cashRegisterId"',
        'p.metodo AS method',
        'p.estado AS status',
        'p.importe_ctvs::float8 AS "amountCents"',
        'CASE WHEN p.estado=\'confirmed\' THEN p.importe_ctvs::float8 ELSE 0 END AS "paidCents"',
        'COALESCE((SELECT d.importe_ctvs FROM devolucion d WHERE d.id_pago=p.id_pago AND d.estado=\'pending\'),0)::float8 AS "refundPendingCents"',
        'COALESCE((SELECT d.importe_ctvs FROM devolucion d WHERE d.id_pago=p.id_pago AND d.estado=\'completed\'),0)::float8 AS "refundedCents"',
        'p.recibido_ctvs::float8 AS "receivedCents"',
        'p.cambio_ctvs::float8 AS "changeCents"',
        "'USD' AS currency",
        'p.creado_en AS "createdAt"',
        'p.verificado_en AS "verifiedAt"',
        'p.motivo_rechazo AS "rejectionReason"',
      ])
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .where(
        'p.id_pago=:id AND (:clientId::uuid IS NULL OR c.id_cliente=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<DetailFindDevolucionRow>();
  }

  private detailFindComprobante(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindComprobanteRow[]> {
    return manager
      .getRepository(Receipt)
      .createQueryBuilder('comprobante')
      .select('mime, tamano AS size, sha256, cargado_en AS "uploadedAt"')
      .where('id_pago=:id')
      .setParameters({ id: input.id })
      .getRawMany<DetailFindComprobanteRow>();
  }

  private detailFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('pago')
      .select([
        'registrado_usuario AS "registeredBy"',
        'registrado_sesion_cliente AS "registeredByGuestSessionId"',
        'verificado_por AS "verifiedBy"',
        'operacion_bancaria_confirmada AS "bankOperationReference"',
      ])
      .where('id_pago=:id')
      .setParameters({ id: input.id })
      .getRawMany<DetailFindPagoRow>();
  }

  private detailFindHistorialPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindHistorialPagoRow[]> {
    return manager
      .getRepository(PaymentHistory)
      .createQueryBuilder('historial_pago')
      .select([
        'actor_usuario AS "userId"',
        'actor_sesion_cliente AS "guestSessionId"',
        'evento AS event',
        'estado_anterior AS "previousStatus"',
        'estado_nuevo AS "newStatus"',
        'ocurrido_en AS "occurredAt"',
      ])
      .where('id_pago=:id')
      .addOrderBy('ocurrido_en', 'ASC')
      .addOrderBy('id_historial_pago', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<DetailFindHistorialPagoRow>();
  }

  private async listPaymentIds(
    manager: EntityManager,
    query: PaymentListDto,
    clientId?: string,
  ) {
    const admin = query as AdminPaymentListDto;
    const args = [
      clientId ?? null,
      query.settlementId ?? null,
      admin.cashRegisterId ?? null,
      admin.accountId ?? null,
      query.method ?? null,
      query.status ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select('count(*)::int AS total')
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::uuid IS NULL OR l.id_liquidacion=:p2) AND (:p3::uuid IS NULL OR l.id_caja=:p3) AND (:p4::uuid IS NULL OR l.id_cuenta=:p4) AND (:p5::text IS NULL OR p.metodo=:p5) AND (:p6::text IS NULL OR p.estado=:p6)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [
      ...args,
      query.limit,
      (query.page - 1) * query.limit,
    ];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const rows: Array<{ id: string }> = await manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select('p.id_pago AS id')
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::uuid IS NULL OR l.id_liquidacion=:p2) AND (:p3::uuid IS NULL OR l.id_caja=:p3) AND (:p4::uuid IS NULL OR l.id_cuenta=:p4) AND (:p5::text IS NULL OR p.metodo=:p5) AND (:p6::text IS NULL OR p.estado=:p6)',
      )
      .addOrderBy('p.creado_en', 'DESC')
      .addOrderBy('p.id_pago', 'DESC')
      .limit(Number(queryValues2[6]))
      .offset(Number(queryValues2[7]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { rows, total };
  }
}
