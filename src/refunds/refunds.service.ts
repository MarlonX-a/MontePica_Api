import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CancellationRequest } from '../cancellations/entities/cancellation-request.entity.js';
import { CashRefundOutflow } from '../cash/entities/cash-refund-outflow.entity.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../operations/entities/operations-settings.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PointsLedgerService } from '../points/points-ledger.service.js';
import { type RefundExecutionDto } from './dto/refund-execution.dto.js';
import { type RefundListDto } from './dto/refund-list.dto.js';
import { RefundHistory } from './entities/refund-history.entity.js';
import { Refund } from './entities/refund.entity.js';
import {
  ExecuteRefundFindConfiguracionOperativaRow,
  ExecuteRefundFindDevolucionRow,
  ExecuteRefundFindPagoRow,
  ExecuteRefundUpdateDevolucionRow,
  RefundFindDevolucionRow,
  RefundFindHistorialDevolucionRow,
} from './types/refunds.types.js';

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund) private readonly records: Repository<Refund>,
    private readonly idem: ParticipationIdempotencyService,
    private readonly points: PointsLedgerService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
  ) {}

  private async staff(
    m: EntityManager,
    a: AuthenticatedRequestContext,
    permission: string,
    admin = false,
  ) {
    await this.authorization.requirePermission(m, a, permission, {
      adminOnly: admin,
      unauthorizedMessage: 'Sesion invalida.',
      adminMessage: 'Solo el administrador puede decidir cancelaciones.',
      permissionMessage: 'Permiso insuficiente.',
    });
  }

  async refunds(q: RefundListDto, clientId?: string, admin = false) {
    const { rows, total } = await this.listRefundIds(
      this.records.manager,
      q,
      clientId,
    );
    const items = await Promise.all(
      rows.map((row) => this.refund(row.id, clientId, admin)),
    );
    return { items, total, page: q.page, limit: q.limit };
  }

  async refund(
    id: string,
    clientId?: string,
    admin = false,
    m: EntityManager = this.records.manager,
  ) {
    const [r] = await this.refundFindDevolucion(m, {
      id,
      clientId: clientId ?? null,
      admin,
    });
    if (!r) throw new NotFoundException('Devolucion no encontrada.');
    if (!admin) {
      delete r.executedBy;
      delete r.cashRegisterId;
      delete r.bankOperationReference;
      delete r.recipientName;
      delete r.notes;
    }
    if (admin)
      r.history = await this.refundFindHistorialDevolucion(m, {
        id,
      });
    return r;
  }

  async executeRefund(
    id: string,
    dto: RefundExecutionDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    try {
      return await this.idem.run(
        { userId: actor.userId },
        `refunds/${id.toLowerCase()}/execute`,
        key,
        dto,
        200,
        'devolucion',
        (m) => this.staff(m, actor, 'refunds.execute', true),
        async (m) => {
          await this.operationalContext.lockTableOperations(m);
          const [refund] = await this.executeRefundFindDevolucion(m, {
            id,
          });
          if (!refund) throw new NotFoundException('Devolucion no encontrada.');
          if (
            refund.estado !== 'pending' ||
            refund.cancellationStatus !== 'approved' ||
            refund.paymentStatus !== 'confirmed'
          )
            throw new ConflictException(
              'La devolucion ya no puede ejecutarse.',
            );
          if (
            !Number.isSafeInteger(refund.amount) ||
            refund.amount <= 0 ||
            !Number.isSafeInteger(refund.paidAmount) ||
            refund.amount > refund.paidAmount
          )
            throw new ConflictException(
              'El importe autorizado supera el pago confirmado.',
            );

          let cashRegisterId: string | null = null;
          if (dto.method === 'cash') {
            const [day] = await this.executeRefundFindConfiguracionOperativa(m);
            if (!day || day.dayStatus !== 'open' || day.cashStatus !== 'open')
              throw new ConflictException(
                'Se requiere jornada y caja actuales abiertas para devolver en efectivo.',
              );
            cashRegisterId = day.cashRegisterId;
            const [totals] = await this.executeRefundFindPago(m, {
              cashRegisterId,
            });
            const balance =
              BigInt(day.opening) +
              BigInt(totals.income) -
              BigInt(totals.refunds);
            if (balance < BigInt(refund.amount))
              throw new ConflictException(
                'La caja no tiene saldo suficiente para esta devolucion.',
              );
          }

          const [updated] = await this.executeRefundUpdateDevolucion(m, {
            id,
            method: dto.method,
            userId: actor.userId,
            bankOperationReference: dto.bankOperationReference ?? null,
            recipientName: dto.recipientName ?? null,
            notes: dto.notes ?? null,
            cashRegisterId,
          });
          if (dto.method === 'cash')
            await this.executeRefundInsertSalidaCajaDevolucion(m, {
              id,
              cashRegisterId,
              amount: refund.amount,
              userId: actor.userId,
            });
          await this.executeRefundInsertHistorialDevolucion(m, {
            id,
            userId: actor.userId,
            detailJson: JSON.stringify({
              method: dto.method,
              amountCents: refund.amount,
              cashRegisterId,
              bankOperationReference: dto.bankOperationReference ?? null,
              recipientName: dto.recipientName ?? null,
              notes: dto.notes ?? null,
            }),
          });
          await this.points.refund(m, id, actor.userId);
          await this.auditLog.append(
            m,
            { userId: actor.userId },
            'devolucion',
            id,
            'refund.completed',
            { method: dto.method, amountCents: refund.amount, cashRegisterId },
          );
          return {
            resourceId: updated.id_devolucion,
            response: await this.refund(id, undefined, true, m),
          };
        },
      );
    } catch (error) {
      const code =
        error instanceof QueryFailedError
          ? (
              error as QueryFailedError & {
                driverError?: { code?: string; constraint?: string };
              }
            ).driverError
          : undefined;
      if (
        code?.code === '23505' &&
        code.constraint === 'uq_devolucion_referencia_bancaria'
      )
        throw new ConflictException('La referencia bancaria ya fue utilizada.');
      throw error;
    }
  }

  private refundFindDevolucion(
    manager: EntityManager,
    input: { id: string; clientId: string | null; admin: boolean },
  ): Promise<RefundFindDevolucionRow[]> {
    return manager
      .getRepository(Refund)
      .createQueryBuilder('d')
      .select([
        'd.id_devolucion AS id',
        'd.id_solicitud AS "cancellationRequestId"',
        'd.id_pedido AS "orderId"',
        'd.id_pago AS "paymentId"',
        'd.importe_ctvs::float8 AS "amountCents"',
        'd.estado AS status',
        'd.creada_en AS "createdAt"',
        'd.metodo AS method',
        'd.ejecutada_en AS "executedAt"',
        'CASE WHEN d.estado=\'completed\' THEN d.importe_ctvs::float8 ELSE 0 END AS "refundedCents"',
        "'USD' AS currency",
        'CASE WHEN :admin::boolean THEN d.ejecutada_por END AS "executedBy"',
        'CASE WHEN :admin::boolean THEN d.id_caja END AS "cashRegisterId"',
        'CASE WHEN :admin::boolean THEN d.referencia_bancaria END AS "bankOperationReference"',
        'CASE WHEN :admin::boolean THEN d.destinatario END AS "recipientName"',
        'CASE WHEN :admin::boolean THEN d.observaciones END AS notes',
      ])
      .innerJoin(Order, 'o', 'o.id_pedido=d.id_pedido')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .where(
        'd.id_devolucion=:id AND (:clientId::uuid IS NULL OR c.id_cliente=:clientId)',
      )
      .setParameters({
        id: input.id,
        clientId: input.clientId,
        admin: input.admin,
      })
      .getRawMany<RefundFindDevolucionRow>();
  }

  private refundFindHistorialDevolucion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RefundFindHistorialDevolucionRow[]> {
    return manager
      .getRepository(RefundHistory)
      .createQueryBuilder('historial_devolucion')
      .select(
        'actor_usuario AS "userId", evento AS event, ocurrido_en AS "occurredAt", detalle',
      )
      .where('id_devolucion=:id')
      .addOrderBy('ocurrido_en', 'ASC')
      .addOrderBy('id_historial', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<RefundFindHistorialDevolucionRow>();
  }

  private executeRefundFindDevolucion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<ExecuteRefundFindDevolucionRow[]> {
    return manager
      .getRepository(Refund)
      .createQueryBuilder('d')
      .select(
        'd.id_devolucion AS id, d.id_solicitud AS "cancellationRequestId", d.id_pago AS "paymentId", d.id_pedido AS "orderId", d.importe_ctvs::float8 AS amount, d.estado, p.estado AS "paymentStatus", p.importe_ctvs::float8 AS "paidAmount", s.estado AS "cancellationStatus"',
      )
      .innerJoin(Payment, 'p', 'p.id_pago=d.id_pago')
      .innerJoin(CancellationRequest, 's', 's.id_solicitud=d.id_solicitud')
      .where('d.id_devolucion=:id')
      .setLock('pessimistic_write', undefined, ['d', 'p', 's'])
      .setParameters({ id: input.id })
      .getRawMany<ExecuteRefundFindDevolucionRow>();
  }

  private executeRefundFindConfiguracionOperativa(
    manager: EntityManager,
  ): Promise<ExecuteRefundFindConfiguracionOperativaRow[]> {
    return manager
      .getRepository(OperationsSettings)
      .createQueryBuilder('op')
      .select([
        'j.id_jornada AS id',
        'c.id_caja AS "cashRegisterId"',
        'c.monto_inicial_ctvs::text AS opening',
        'j.estado AS "dayStatus"',
        'c.estado AS "cashStatus"',
      ])
      .innerJoin(
        OperatingDay,
        'j',
        'j.fecha_operativa=timezone(op.zona_horaria,clock_timestamp())::date',
      )
      .innerJoin(CashRegister, 'c', 'c.id_jornada=j.id_jornada')
      .where('op.id_configuracion=1')
      .setLock('pessimistic_write', undefined, ['j', 'c'])
      .getRawMany<ExecuteRefundFindConfiguracionOperativaRow>();
  }

  private executeRefundFindPago(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<ExecuteRefundFindPagoRow[]> {
    return manager
      .createQueryBuilder()
      .select([
        "COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=:cashRegisterId AND p.metodo='cash' AND p.estado='confirmed'),0)::text AS income",
        'COALESCE((SELECT sum(x.importe_ctvs) FROM salida_caja_devolucion x WHERE x.id_caja=:cashRegisterId),0)::text AS refunds',
      ])
      .from('(SELECT 1)', '_singleton')
      .setParameters({ cashRegisterId: input.cashRegisterId })
      .getRawMany<ExecuteRefundFindPagoRow>();
  }

  private async executeRefundUpdateDevolucion(
    manager: EntityManager,
    input: {
      id: string;
      method: 'cash' | 'transfer';
      userId: string;
      bankOperationReference: string | null;
      recipientName: string | null;
      notes: string | null;
      cashRegisterId: string | null;
    },
  ): Promise<ExecuteRefundUpdateDevolucionRow[]> {
    const rows = await manager
      .getRepository(Refund)
      .createQueryBuilder()
      .update(Refund)
      .set({
        estado: 'completed',
        metodo: input.method,
        ejecutada_por: input.userId,
        ejecutada_en: () => 'clock_timestamp()',
        referencia_bancaria: input.bankOperationReference,
        destinatario: input.recipientName,
        observaciones: input.notes,
        id_caja: input.cashRegisterId,
      })
      .where('id_devolucion=:id')
      .returning('id_devolucion')
      .setParameters({ id: input.id })
      .execute()
      .then((result) => result.raw);
    return rows;
  }

  private async executeRefundInsertSalidaCajaDevolucion(
    manager: EntityManager,
    input: {
      id: string;
      cashRegisterId: string | null;
      amount: number;
      userId: string;
    },
  ): Promise<void> {
    await manager
      .getRepository(CashRefundOutflow)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_devolucion: input.id,
          id_caja: input.cashRegisterId!,
          importe_ctvs: String(input.amount),
          registrada_por: input.userId,
        },
      ])
      .execute();
  }

  private async executeRefundInsertHistorialDevolucion(
    manager: EntityManager,
    input: { id: string; userId: string; detailJson: string },
  ): Promise<void> {
    await manager
      .getRepository(RefundHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_devolucion: input.id,
          actor_usuario: input.userId,
          evento: 'refund.completed',
          detalle: () => ':detailJson::jsonb',
        },
      ])
      .setParameters({ detailJson: input.detailJson })
      .execute();
  }

  private async listRefundIds(
    manager: EntityManager,
    q: RefundListDto,
    clientId?: string,
  ) {
    const args = [
      clientId ?? null,
      q.orderId ?? null,
      q.paymentId ?? null,
      q.status ?? null,
      q.method ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(Refund)
      .createQueryBuilder('d')
      .select('count(*)::int AS total')
      .innerJoin(Payment, 'p', 'p.id_pago=d.id_pago')
      .innerJoin(Order, 'o', 'o.id_pedido=d.id_pedido')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::uuid IS NULL OR d.id_pedido=:p2) AND (:p3::uuid IS NULL OR d.id_pago=:p3) AND (:p4::text IS NULL OR d.estado=:p4) AND (:p5::text IS NULL OR d.metodo=:p5)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [...args, q.limit, (q.page - 1) * q.limit];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const rows = await manager
      .getRepository(Refund)
      .createQueryBuilder('d')
      .select('d.id_devolucion AS id')
      .innerJoin(Payment, 'p', 'p.id_pago=d.id_pago')
      .innerJoin(Order, 'o', 'o.id_pedido=d.id_pedido')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::uuid IS NULL OR d.id_pedido=:p2) AND (:p3::uuid IS NULL OR d.id_pago=:p3) AND (:p4::text IS NULL OR d.estado=:p4) AND (:p5::text IS NULL OR d.metodo=:p5)',
      )
      .addOrderBy('d.creada_en', 'DESC')
      .addOrderBy('d.id_devolucion', 'DESC')
      .limit(Number(queryValues2[5]))
      .offset(Number(queryValues2[6]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { rows, total };
  }
}
