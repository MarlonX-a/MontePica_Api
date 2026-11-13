import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountLifecycleService } from '../accounts/account-lifecycle.service.js';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { ConsumptionAssignment } from '../accounts/entities/consumption-assignment.entity.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { type ClientIdentity } from '../common/identity/client-access.guard.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { DailyInventory } from '../inventory/entities/daily-inventory.entity.js';
import { InventoryReservation } from '../orders/entities/inventory-reservation.entity.js';
import { OrderHistory } from '../orders/entities/order-history.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { OrderVersion } from '../orders/entities/order-version.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PointsAccrual } from '../points/entities/points-accrual.entity.js';
import { RedemptionReservationsService } from '../redemptions/redemption-reservations.service.js';
import { RefundHistory } from '../refunds/entities/refund-history.entity.js';
import { Refund } from '../refunds/entities/refund.entity.js';
import { SettlementItem } from '../settlements/entities/settlement-item.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { type AdminCancellationListDto } from './dto/admin-cancellation-list.dto.js';
import { type CancellationCreateDto } from './dto/cancellation-create.dto.js';
import { type CancellationListDto } from './dto/cancellation-list.dto.js';
import { CancellationHistory } from './entities/cancellation-history.entity.js';
import { CancellationRequest } from './entities/cancellation-request.entity.js';
import {
  CreateFindLiquidacionNextRow,
  CreateFindLiquidacionRow,
  CreateFindPedidoNextRow,
  CreateFindPedidoRow,
  CreateFindSolicitudCancelacionRow,
  CreateInsertSolicitudCancelacionRow,
  DecideFindPagoRow,
  DecideFindSolicitudCancelacionRow,
  DecideFindVersionPedidoRow,
  DecideInsertDevolucionRow,
  DetailFindHistorialCancelacionRow,
  DetailFindSolicitudCancelacionRow,
} from './types/cancellations.types.js';

@Injectable()
export class CancellationsService {
  constructor(
    @InjectRepository(CancellationRequest)
    private readonly records: Repository<CancellationRequest>,
    private readonly idem: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly rewards: RedemptionReservationsService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
    private readonly accountLifecycle: AccountLifecycleService,
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

  async create(
    orderId: string,
    dto: CancellationCreateDto,
    actor: { userId?: string; guestSessionId?: string; sessionId?: string },
    client?: ClientIdentity,
    key?: string,
  ) {
    return this.idem.run(
      actor,
      `orders/${orderId.toLowerCase()}/cancellation-requests`,
      key,
      dto,
      201,
      'solicitud_cancelacion',
      async (m) => {
        if (client) {
          await this.participants.authenticate(m, client);
          const [o] = await this.createFindPedido(m, {
            orderId,
            clientId: client.clientId,
          });
          if (!o) throw new NotFoundException('Pedido no encontrado.');
        } else
          await this.staff(
            m,
            actor as AuthenticatedRequestContext,
            'cancellations.create',
          );
      },
      async (m) => {
        await this.operationalContext.lockTableOperations(m);
        const [o] = await this.createFindPedidoNext(m, {
          orderId,
        });
        if (!o) throw new NotFoundException('Pedido no encontrado.');
        const eligible =
          (o.modalidad === 'local' &&
            ['preparing', 'ready'].includes(o.estado)) ||
          (o.modalidad === 'delivery' &&
            ['submitted', 'preparing', 'ready'].includes(o.estado));
        if (!eligible || o.numero !== dto.expectedVersion)
          throw new ConflictException(
            'El pedido o su version no admite cancelacion.',
          );
        const [pay] = await this.createFindLiquidacion(m, {
          id_cuenta: o.id_cuenta,
        });
        if (pay)
          throw new ConflictException(
            'Existe una transferencia pendiente de revision.',
          );
        const [duplicate] = await this.createFindSolicitudCancelacion(m, {
          orderId,
        });
        if (duplicate)
          throw new ConflictException('Ya existe una solicitud pendiente.');
        if (o.modalidad === 'delivery' && o.estado === 'submitted') {
          const [paid] = await this.createFindLiquidacionNext(m, {
            id_cuenta: o.id_cuenta,
          });
          if (!paid)
            throw new ConflictException(
              'Utiliza la anulacion directa para pedidos sin pago.',
            );
        }
        const [r] = await this.createInsertSolicitudCancelacion(m, {
          orderId,
          id_version: o.id_version,
          estado: o.estado,
          reason: dto.reason,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
          requestedByClient: !!client,
        });
        await this.createInsertHistorialCancelacion(m, {
          id: r.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
        });
        await this.auditLog.append(
          m,
          actor,
          'solicitud_cancelacion',
          r.id,
          'cancellation.requested',
          { orderId, reason: dto.reason },
        );
        return {
          resourceId: r.id,
          response: await this.detail(r.id, client?.clientId, m),
        };
      },
    );
  }

  async detail(
    id: string,
    clientId?: string,
    m: EntityManager = this.records.manager,
  ) {
    const [r] = await this.detailFindSolicitudCancelacion(m, {
      id,
      clientId: clientId ?? null,
    });
    if (!r) throw new NotFoundException('Solicitud no encontrada.');
    if (clientId) {
      delete r.requestedBy;
      delete r.decidedBy;
    } else
      r.history = await this.detailFindHistorialCancelacion(m, {
        id,
      });
    return r;
  }

  async list(q: CancellationListDto, clientId?: string) {
    const { rows, total } = await this.listCancellationIds(
      this.records.manager,
      q,
      clientId,
    );
    return {
      items: await Promise.all(
        rows.map((x: { id: string }) => this.detail(x.id, clientId)),
      ),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async decide(
    id: string,
    decision: 'approve' | 'reject' | 'withdraw',
    a: AuthenticatedRequestContext,
    client: ClientIdentity | undefined,
    reason: string | undefined,
    key?: string,
  ) {
    a = a ?? {
      userId: client?.userId ?? '',
      sessionId: client?.userSessionId ?? '',
    };
    return this.idem.run(
      client
        ? client.guestSessionId
          ? { guestSessionId: client.guestSessionId }
          : { userId: client.userId }
        : { userId: a.userId },
      `cancellations/${id.toLowerCase()}/${decision}`,
      key,
      { reason: reason ?? null },
      200,
      'solicitud_cancelacion',
      async (m) => {
        if (client) {
          await this.participants.authenticate(m, client);
          await this.detail(id, client.clientId, m);
        } else
          await this.staff(
            m,
            a,
            decision === 'approve' || decision === 'reject'
              ? 'cancellations.decide'
              : 'cancellations.read',
            decision !== 'withdraw',
          );
      },
      async (m) => {
        await this.operationalContext.lockTableOperations(m);
        const [r] = await this.decideFindSolicitudCancelacion(m, {
          id,
        });
        if (!r) throw new NotFoundException('Solicitud no encontrada.');
        const [currentVersion] = await this.decideFindVersionPedido(m, {
          id_pedido: r.id_pedido,
        });
        if (
          r.estado !== 'pending' ||
          r.current_order !== r.estado_pedido ||
          currentVersion?.id_version !== r.id_version
        )
          throw new ConflictException('La solicitud ya no está vigente.');
        if (
          decision === 'withdraw' &&
          (!r.solicitada_cliente ||
            !client ||
            (client.guestSessionId
              ? r.actor_sesion_cliente !== client.guestSessionId
              : r.actor_usuario !== client.userId))
        )
          throw new NotFoundException('Solicitud no encontrada.');
        let status =
          decision === 'approve'
            ? 'approved'
            : decision === 'reject'
              ? 'rejected'
              : 'withdrawn';
        let refund = null;
        if (decision === 'approve') {
          const [pending] = await this.decideFindPago(m, {
            id_cuenta: r.id_cuenta,
          });
          if (pending)
            throw new ConflictException('Existe transferencia pendiente.');
          await this.decideUpdatePedido(m, {
            id_pedido: r.id_pedido,
          });
          await this.rewards.refundForOrder(m, r.id_pedido, {
            userId: a.userId,
          });
          await this.decideInsertHistorialPedido(m, {
            id_pedido: r.id_pedido,
            id_version: r.id_version,
            userId: a.userId,
            current_order: r.current_order,
          });
          await this.decideLockReservaInventario(m, {
            id_version: r.id_version,
          });
          await this.decideUpdateAsignacionConsumo(m, {
            id_version: r.id_version,
          });
          await this.decideUpdateLiquidacion(m, {
            id_cuenta: r.id_cuenta,
            userId: a.userId,
          });
          await this.decideUpdateDetalleLiquidacion(m, {
            id_cuenta: r.id_cuenta,
          });
          if (r.modalidad === 'delivery' && r.payment_status === 'confirmed') {
            const amount = Number(r.total_ctvs);
            if (
              !Number.isSafeInteger(amount) ||
              amount <= 0 ||
              amount > Number(r.importe_ctvs)
            )
              throw new ConflictException('Importe de devolución no válido.');
            const [d] = await this.decideInsertDevolucion(m, {
              id,
              id_pago: r.id_pago,
              id_pedido: r.id_pedido,
              amount,
              userId: a.userId,
            });
            await this.decideInsertHistorialDevolucion(m, {
              id: d.id,
              userId: a.userId,
              detailJson: JSON.stringify({
                cancellationRequestId: id,
                paymentId: r.id_pago,
                amountCents: amount,
              }),
            });
            refund = { id: d.id, amountCents: amount, status: 'pending' };
            await this.accountLifecycle.closeAccount(m, {
              id_cuenta: r.id_cuenta,
            });
            await this.decideUpdateAcumulacionPuntos(m, {
              id_pago: r.id_pago,
            });
          }
        }
        await this.decideUpdateSolicitudCancelacion(m, {
          id,
          status,
          userId: a.userId || null,
          rejectionReason: decision === 'reject' ? reason : null,
        });
        await this.decideInsertHistorialCancelacion(m, {
          id,
          userId: a.userId || null,
          guestSessionId: client?.guestSessionId ?? null,
          decision,
        });
        await this.auditLog.append(
          m,
          {
            userId: a.userId || client?.userId,
            guestSessionId: client?.guestSessionId,
          },
          'solicitud_cancelacion',
          id,
          `cancellation.${decision}`,
          { reason: reason ?? null, refund },
        );
        return {
          resourceId: id,
          response: { ...(await this.detail(id, client?.clientId, m)), refund },
        };
      },
    );
  }

  private createFindPedido(
    manager: EntityManager,
    input: { orderId: string; clientId: string },
  ): Promise<CreateFindPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('1 AS "1"')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .where('o.id_pedido=:orderId AND c.id_cliente=:clientId')
      .setParameters({ orderId: input.orderId, clientId: input.clientId })
      .getRawMany<CreateFindPedidoRow>();
  }

  private createFindPedidoNext(
    manager: EntityManager,
    input: { orderId: string },
  ): Promise<CreateFindPedidoNextRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('o.estado, o.modalidad, o.id_cuenta, v.id_version, v.numero')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .innerJoin(
        OrderVersion,
        'v',
        "v.id_pedido=o.id_pedido AND v.estado='current'",
      )
      .where('o.id_pedido=:orderId')
      .setLock('pessimistic_write', undefined, ['o', 'v', 'c'])
      .setParameters({ orderId: input.orderId })
      .getRawMany<CreateFindPedidoNextRow>();
  }

  private createFindLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<CreateFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('l')
      .select('1 AS "1"')
      .innerJoin(Payment, 'p', 'p.id_liquidacion=l.id_liquidacion')
      .where("l.id_cuenta=:id_cuenta AND p.estado='pendingVerification'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<CreateFindLiquidacionRow>();
  }

  private createFindSolicitudCancelacion(
    manager: EntityManager,
    input: { orderId: string },
  ): Promise<CreateFindSolicitudCancelacionRow[]> {
    return manager
      .getRepository(CancellationRequest)
      .createQueryBuilder('solicitud_cancelacion')
      .select('1 AS "1"')
      .where("id_pedido=:orderId AND estado='pending'")
      .setParameters({ orderId: input.orderId })
      .getRawMany<CreateFindSolicitudCancelacionRow>();
  }

  private createFindLiquidacionNext(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<CreateFindLiquidacionNextRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('l')
      .select('1 AS "1"')
      .innerJoin(Payment, 'p', 'p.id_liquidacion=l.id_liquidacion')
      .where("l.id_cuenta=:id_cuenta AND p.estado='confirmed'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<CreateFindLiquidacionNextRow>();
  }

  private createInsertSolicitudCancelacion(
    manager: EntityManager,
    input: {
      orderId: string;
      id_version: string;
      estado: string;
      reason: string;
      userId: string | null;
      guestSessionId: string | null;
      requestedByClient: boolean;
    },
  ): Promise<CreateInsertSolicitudCancelacionRow[]> {
    return manager
      .getRepository(CancellationRequest)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.orderId,
          id_version: input.id_version,
          estado_pedido: input.estado,
          motivo: input.reason,
          actor_usuario: input.userId,
          actor_sesion_cliente: input.guestSessionId,
          solicitada_cliente: input.requestedByClient,
        },
      ])
      .returning('id_solicitud AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async createInsertHistorialCancelacion(
    manager: EntityManager,
    input: { id: string; userId: string | null; guestSessionId: string | null },
  ): Promise<void> {
    await manager
      .getRepository(CancellationHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_solicitud: input.id,
          actor_usuario: input.userId,
          actor_sesion_cliente: input.guestSessionId,
          evento: 'requested',
        },
      ])
      .execute();
  }

  private detailFindSolicitudCancelacion(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<DetailFindSolicitudCancelacionRow[]> {
    return manager
      .getRepository(CancellationRequest)
      .createQueryBuilder('s')
      .select([
        's.id_solicitud AS id',
        's.id_pedido AS "orderId"',
        'o.modalidad AS modality',
        'o.id_jornada AS "operatingDayId"',
        's.id_version AS "versionId"',
        's.estado_pedido AS "orderStatus"',
        's.estado AS status',
        's.motivo AS reason',
        's.creada_en AS "createdAt"',
        's.decidida_en AS "decidedAt"',
        's.motivo_rechazo AS "rejectionReason"',
        's.actor_usuario AS "requestedBy"',
        's.decidida_por AS "decidedBy"',
      ])
      .innerJoin(Order, 'o', 'o.id_pedido=s.id_pedido')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .where(
        's.id_solicitud=:id AND (:clientId::uuid IS NULL OR c.id_cliente=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<DetailFindSolicitudCancelacionRow>();
  }

  private detailFindHistorialCancelacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindHistorialCancelacionRow[]> {
    return manager
      .getRepository(CancellationHistory)
      .createQueryBuilder('historial_cancelacion')
      .select([
        'evento AS event',
        'actor_usuario AS "userId"',
        'actor_sesion_cliente AS "guestSessionId"',
        'ocurrido_en AS "occurredAt"',
      ])
      .where('id_solicitud=:id')
      .addOrderBy('ocurrido_en', 'ASC')
      .addOrderBy('id_historial', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<DetailFindHistorialCancelacionRow>();
  }

  private decideFindSolicitudCancelacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCancelacionRow[]> {
    return manager
      .getRepository(CancellationRequest)
      .createQueryBuilder('s')
      .select(
        's.*, o.id_pedido, o.id_cuenta, o.modalidad, o.estado AS current_order, c.estado AS account_status, p.id_pago, p.id_liquidacion, p.estado AS payment_status, p.importe_ctvs, l.total_ctvs',
      )
      .innerJoin(Order, 'o', 'o.id_pedido=s.id_pedido')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .leftJoin(Settlement, 'l', 'l.id_cuenta=c.id_cuenta')
      .leftJoin(
        Payment,
        'p',
        "p.id_liquidacion=l.id_liquidacion AND p.estado='confirmed'",
      )
      .where('s.id_solicitud=:id')
      .setLock('pessimistic_write', undefined, ['s', 'o', 'c'])
      .setParameters({ id: input.id })
      .getRawMany<DecideFindSolicitudCancelacionRow>();
  }

  private decideFindVersionPedido(
    manager: EntityManager,
    input: { id_pedido: string },
  ): Promise<DecideFindVersionPedidoRow[]> {
    return manager
      .getRepository(OrderVersion)
      .createQueryBuilder('version_pedido')
      .select('id_version AS "id_version"')
      .where("id_pedido=:id_pedido AND estado='current'")
      .setParameters({ id_pedido: input.id_pedido })
      .getRawMany<DecideFindVersionPedidoRow>();
  }

  private decideFindPago(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<DecideFindPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select('1 AS "1"')
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .where("l.id_cuenta=:id_cuenta AND p.estado='pendingVerification'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<DecideFindPagoRow>();
  }

  private async decideUpdatePedido(
    manager: EntityManager,
    input: { id_pedido: string },
  ): Promise<void> {
    await manager
      .getRepository(Order)
      .createQueryBuilder()
      .update(Order)
      .set({ estado: 'cancelled' })
      .where('id_pedido=:id_pedido')
      .setParameters({ id_pedido: input.id_pedido })
      .execute();
  }

  private async decideInsertHistorialPedido(
    manager: EntityManager,
    input: {
      id_pedido: string;
      id_version: string;
      userId: string;
      current_order: string;
    },
  ): Promise<void> {
    await manager
      .getRepository(OrderHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.id_pedido,
          id_version: input.id_version,
          actor_usuario: input.userId,
          actor_tipo: 'usuario',
          evento: 'order.cancellationApproved',
          estado_anterior: input.current_order,
          estado_nuevo: 'cancelled',
          motivo: 'cancelledByRequest',
        },
      ])
      .execute();
  }

  private async decideLockReservaInventario(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<void> {
    const reserves = await manager
      .getRepository(InventoryReservation)
      .createQueryBuilder('r')
      .innerJoin(OrderItem, 'd', 'd.id_detalle=r.id_detalle')
      .select('r.id_reserva', 'id')
      .addSelect('r.id_inventario', 'inventoryId')
      .addSelect('r.cantidad', 'quantity')
      .where("d.id_version=:version AND r.estado='active'", {
        version: input.id_version,
      })
      .orderBy('r.id_inventario')
      .setLock('pessimistic_write', undefined, ['r'])
      .getRawMany<{ id: string; inventoryId: string; quantity: number }>();
    for (const reserve of reserves) {
      await manager
        .getRepository(InventoryReservation)
        .update(
          { id_reserva: reserve.id },
          { estado: 'released', resuelta_en: () => 'clock_timestamp()' },
        );
      await manager
        .getRepository(DailyInventory)
        .decrement(
          { id_inventario: reserve.inventoryId },
          'cantidad_reservada',
          reserve.quantity,
        );
    }
  }

  private async decideUpdateAsignacionConsumo(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder()
      .update(ConsumptionAssignment)
      .set({ estado: 'superseded' })
      .where(
        "id_detalle IN (SELECT id_detalle FROM detalle_pedido WHERE id_version=:id_version) AND estado='active'",
      )
      .setParameters({ id_version: input.id_version })
      .execute();
  }

  private async decideUpdateLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string; userId: string },
  ): Promise<void> {
    await manager
      .getRepository(Settlement)
      .createQueryBuilder()
      .update(Settlement)
      .set({
        estado: 'cancelled',
        anulada_por: input.userId,
        anulada_en: () => 'clock_timestamp()',
        motivo_anulacion: 'cancelledByRequest',
      })
      .where("id_cuenta=:id_cuenta AND estado='pending'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  private async decideUpdateDetalleLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(SettlementItem)
      .createQueryBuilder()
      .update(SettlementItem)
      .set({ vigente: false })
      .where(
        "id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=:id_cuenta AND estado='cancelled')",
      )
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  private decideInsertDevolucion(
    manager: EntityManager,
    input: {
      id: string;
      id_pago: string;
      id_pedido: string;
      amount: number;
      userId: string;
    },
  ): Promise<DecideInsertDevolucionRow[]> {
    return manager
      .getRepository(Refund)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_solicitud: input.id,
          id_pago: input.id_pago,
          id_pedido: input.id_pedido,
          importe_ctvs: String(input.amount),
          autorizada_por: input.userId,
        },
      ])
      .returning('id_devolucion AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async decideInsertHistorialDevolucion(
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
          evento: 'refund.authorized',
          detalle: () => ':detailJson::jsonb',
        },
      ])
      .setParameters({ detailJson: input.detailJson })
      .execute();
  }

  private async decideUpdateAcumulacionPuntos(
    manager: EntityManager,
    input: { id_pago: string },
  ): Promise<void> {
    await manager
      .getRepository(PointsAccrual)
      .createQueryBuilder()
      .update(PointsAccrual)
      .set({ estado: 'cancelled' })
      .where("id_pago=:id_pago AND estado='pending'")
      .setParameters({ id_pago: input.id_pago })
      .execute();
  }

  private async decideUpdateSolicitudCancelacion(
    manager: EntityManager,
    input: {
      id: string;
      status: string;
      userId: string | null;
      rejectionReason: string | null | undefined;
    },
  ): Promise<void> {
    await manager
      .getRepository(CancellationRequest)
      .createQueryBuilder()
      .update(CancellationRequest)
      .set({
        estado: input.status,
        decidida_por: input.userId,
        decidida_en: () => 'clock_timestamp()',
        motivo_rechazo: input.rejectionReason,
      })
      .where('id_solicitud=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async decideInsertHistorialCancelacion(
    manager: EntityManager,
    input: {
      id: string;
      userId: string | null;
      guestSessionId: string | null;
      decision: 'approve' | 'reject' | 'withdraw';
    },
  ): Promise<void> {
    await manager
      .getRepository(CancellationHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_solicitud: input.id,
          actor_usuario: input.userId,
          actor_sesion_cliente: input.guestSessionId,
          evento: input.decision,
        },
      ])
      .execute();
  }

  private async listCancellationIds(
    manager: EntityManager,
    q: CancellationListDto,
    clientId?: string,
  ) {
    const a = q as AdminCancellationListDto;
    const args = [
      clientId ?? null,
      q.status ?? null,
      q.orderId ?? null,
      a.modality ?? null,
      a.operatingDayId ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(CancellationRequest)
      .createQueryBuilder('s')
      .select('count(*)::int AS total')
      .innerJoin(Order, 'o', 'o.id_pedido=s.id_pedido')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::text IS NULL OR s.estado=:p2) AND (:p3::uuid IS NULL OR s.id_pedido=:p3) AND (:p4::text IS NULL OR o.modalidad=:p4) AND (:p5::uuid IS NULL OR o.id_jornada=:p5)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [...args, q.limit, (q.page - 1) * q.limit];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const rows = await manager
      .getRepository(CancellationRequest)
      .createQueryBuilder('s')
      .select('s.id_solicitud AS id')
      .innerJoin(Order, 'o', 'o.id_pedido=s.id_pedido')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::text IS NULL OR s.estado=:p2) AND (:p3::uuid IS NULL OR s.id_pedido=:p3) AND (:p4::text IS NULL OR o.modalidad=:p4) AND (:p5::uuid IS NULL OR o.id_jornada=:p5)',
      )
      .addOrderBy('s.creada_en', 'DESC')
      .addOrderBy('s.id_solicitud', 'DESC')
      .limit(Number(queryValues2[5]))
      .offset(Number(queryValues2[6]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { rows, total };
  }
}
