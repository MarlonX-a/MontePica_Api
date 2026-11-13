import { forEachSequential } from '../common/async/for-each-sequential.js';
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
import { ConsumptionAssignment } from '../accounts/entities/consumption-assignment.entity.js';
import { UserSession } from '../auth/entities/user-session.entity.js';
import { CancellationRequest } from '../cancellations/entities/cancellation-request.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { type ClientIdentity } from '../common/identity/client-access.guard.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { DeliveryDetails } from '../delivery/entities/delivery-details.entity.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PointsLedgerService } from '../points/points-ledger.service.js';
import { RedemptionReservationsService } from '../redemptions/redemption-reservations.service.js';
import { SettlementItem } from '../settlements/entities/settlement-item.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { User } from '../users/entities/user.entity.js';
import { type CancelOrderDto } from './dto/cancel-order.dto.js';
import { type OrderTransitionDto } from './dto/order-transition.dto.js';
import { OrderHistory } from './entities/order-history.entity.js';
import { OrderVersion } from './entities/order-version.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderInventoryService } from './order-inventory.service.js';
import { OrdersQueryService } from './orders-query.service.js';
import {
  EditFindPedidoRow,
  TransitionFindCuentaConsumoRow,
  TransitionFindJornadaOperativaRow,
  TransitionFindLiquidacionRow,
  TransitionFindPagoRow,
  TransitionFindPedidoNextRow,
  TransitionFindSolicitudCancelacionRow,
  TransitionFindUsuarioNextRow,
  TransitionFindUsuarioRow,
} from './types/orders.types.js';

type TransitionContext = {
  order: TransitionFindPedidoNextRow;
  action: Parameters<OrdersLifecycleService['transition']>[1];
  dto: OrderTransitionDto | CancelOrderDto;
  actor: Parameters<OrdersLifecycleService['transition']>[3];
  zone: string;
  client?: ClientIdentity;
};

@Injectable()
export class OrdersLifecycleService {
  constructor(
    @InjectRepository(Order) private readonly records: Repository<Order>,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly points: PointsLedgerService,
    private readonly rewards: RedemptionReservationsService,
    private readonly queries: OrdersQueryService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
    private readonly inventoryOperations: OrderInventoryService,
    private readonly accountLifecycle: AccountLifecycleService,
  ) {}

  async transition(
    id: string,
    action: 'cancel' | 'start-preparation' | 'ready' | 'dispatch' | 'deliver',
    dto: OrderTransitionDto | CancelOrderDto,
    actor: { userId?: string; guestSessionId?: string; sessionId?: string },
    client?: ClientIdentity,
    key?: string,
  ) {
    return this.idempotency.run(
      actor,
      `orders/${id.toLowerCase()}/${action}`,
      key,
      dto,
      200,
      'pedido',
      {
        authorize: async (m) => {
          if (client) {
            await this.participants.authenticate(m, client);
            await this.detail(id, client.clientId, false, m);
          } else {
            const [valid] = await this.transitionFindUsuario(m, {
              userId: actor.userId,
              sessionId: actor.sessionId,
            });
            if (!valid) throw new UnauthorizedException('Sesion no valida.');
            const [allowed] = await this.transitionFindUsuarioNext(m, {
              userId: actor.userId,
            });
            if (!allowed)
              throw new ForbiddenException('Falta permiso orders.manage.');
          }
        },
        action: async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const [ref] = await this.editFindPedido(m, { id });
          if (!ref) throw new NotFoundException('Pedido no encontrado.');
          if (action === 'start-preparation' && ref.id_visita)
            await this.operationalContext.lockActiveVisit(
              m,
              ref.id_visita,
              zone,
            );
          const [order] = await this.transitionFindPedidoNext(m, {
            id,
          });
          await this.applyDeliveryTransition(m, {
            order,
            action,
            dto,
            actor,
            zone,
            client,
          });
          const [pendingCancellation] =
            await this.transitionFindSolicitudCancelacion(m, {
              id,
            });
          if (pendingCancellation && action !== 'cancel')
            throw new ConflictException(
              'El pedido tiene una solicitud de cancelacion pendiente.',
            );
          if (action === 'dispatch' && order.modalidad !== 'delivery')
            throw new ConflictException('Solo domicilios admiten despacho.');
          const expected: Record<string, string> = {
            cancel: 'submitted',
            'start-preparation': 'submitted',
            ready: 'preparing',
            dispatch: 'ready',
            deliver: order.modalidad === 'delivery' ? 'dispatched' : 'ready',
          };
          if (
            order.numero !== dto.expectedVersion ||
            order.estado !== expected[action]
          )
            throw new ConflictException(
              'Estado o versión del pedido no válidos.',
            );
          const target: Record<string, string> = {
            cancel: 'cancelled',
            'start-preparation': 'preparing',
            ready: 'ready',
            dispatch: 'dispatched',
            deliver: 'delivered',
          };
          await this.resolveInventory(m, { order, action, actor });
          await this.transitionUpdatePedido(m, {
            id,
            status: target[action],
          });
          if (action === 'cancel' && order.origen === 'reward')
            await this.rewards.refundForOrder(m, id, actor);
          await this.completeDeliveryTransition(m, {
            id,
            order,
            action,
            actor,
          });
          const reason = 'reason' in dto ? dto.reason : null;
          await this.transitionInsertHistorialPedido(m, {
            id,
            id_version: order.id_version,
            userId: actor.userId ?? null,
            guestSessionId: actor.guestSessionId ?? null,
            actorType: actor.guestSessionId ? 'sesion_cliente' : 'usuario',
            event: `order.${action}`,
            estado: order.estado,
            nextStatus: target[action],
            reason,
          });
          await this.auditLog.append(
            m,
            actor,
            'pedido',
            id,
            `order.${action}`,
            {
              before: order.estado,
              after: target[action],
              reason,
            },
          );
          return {
            resourceId: id,
            response: await this.detail(id, client?.clientId, false, m),
          };
        },
      },
    );
  }

  private async applyDeliveryTransition(
    m: EntityManager,
    context: TransitionContext,
  ) {
    const { order, action, dto, actor, zone, client } = context;
    if (order.modalidad !== 'delivery') return;

    if (client)
      throw new ConflictException('Operación no habilitada para domicilios.');
    const [account] = await this.transitionFindCuentaConsumo(m, {
      id_cuenta: order.id_cuenta,
    });
    if (account.estado !== 'open')
      throw new ConflictException('La cuenta debe estar abierta.');
    if (action === 'start-preparation' || action === 'dispatch') {
      const [day] = await this.transitionFindJornadaOperativa(m, {
        id_jornada: order.id_jornada,
        zone,
      });
      const [paid] = await this.transitionFindLiquidacion(m, {
        id_cuenta: order.id_cuenta,
      });
      if ((action === 'start-preparation' && !day) || !paid)
        throw new ConflictException(
          'Se requiere jornada actual abierta y transferencia confirmada.',
        );
    }
    if (action === 'cancel') {
      const [payment] = await this.transitionFindPago(m, {
        id_cuenta: order.id_cuenta,
      });
      if (payment)
        throw new ConflictException('Existe un pago confirmado o pendiente.');
      await this.transitionUpdateLiquidacion(m, {
        id_cuenta: order.id_cuenta,
        userId: actor.userId,
        reason: 'reason' in dto ? dto.reason : null,
      });
      await this.transitionUpdateDetalleLiquidacion(m, {
        id_cuenta: order.id_cuenta,
      });
      await this.accountLifecycle.closeAccount(m, {
        id_cuenta: order.id_cuenta,
      });
    }
  }

  private async resolveInventory(
    m: EntityManager,
    context: Pick<TransitionContext, 'order' | 'action' | 'actor'>,
  ) {
    const { order, action, actor } = context;
    if (action !== 'cancel' && action !== 'start-preparation') return;

    const reservations: Array<{
      id: string;
      inventory: string;
      quantity: number;
      physical: number;
    }> = await this.inventoryOperations.lockReservationsForConsumption(m, {
      versionId: order.id_version,
    });
    await forEachSequential(reservations, async (reservation) => {
      if (action === 'cancel')
        await this.inventoryOperations.decreaseReservedQuantity(m, {
          inventoryId: reservation.inventory,
          quantity: reservation.quantity,
        });
      else {
        await this.inventoryOperations.consumeReservedQuantity(m, {
          inventoryId: reservation.inventory,
          quantity: reservation.quantity,
        });
        await this.inventoryOperations.recordConsumptionMovement(m, {
          inventoryId: reservation.inventory,
          reservationId: reservation.id,
          userId: actor.userId,
          physicalDelta: -reservation.quantity,
          previousQuantity: reservation.physical,
          resultingQuantity: reservation.physical - reservation.quantity,
        });
      }
      await this.inventoryOperations.resolveReservation(m, {
        reservationId: reservation.id,
        status: action === 'cancel' ? 'released' : 'consumed',
      });
    });
    if (action === 'cancel')
      await this.editUpdateAsignacionConsumo(m, {
        id_version: order.id_version,
      });
  }

  private async completeDeliveryTransition(
    m: EntityManager,
    context: { id: string } & Pick<
      TransitionContext,
      'order' | 'action' | 'actor'
    >,
  ) {
    const { id, order, action, actor } = context;
    if (
      order.modalidad === 'delivery' &&
      (action === 'dispatch' || action === 'deliver')
    ) {
      await this.transitionUpdateEntregaDomicilio(
        m,
        [id, actor.userId],
        action,
      );
      if (action === 'deliver')
        await this.accountLifecycle.closeAccount(m, {
          id_cuenta: order.id_cuenta,
        });
      if (action === 'deliver')
        await this.points.deliverOrder(m, id, actor.userId ?? '');
    }
  }

  async detail(
    id: string,
    clientId?: string,
    history = false,
    m: EntityManager = this.records.manager,
  ) {
    return this.queries.detail(id, clientId, history, m);
  }

  private editFindPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<EditFindPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('pedido')
      .select('id_visita AS "id_visita"')
      .where('id_pedido=:id')
      .setParameters({ id: input.id })
      .getRawMany<EditFindPedidoRow>();
  }

  private async editUpdateAsignacionConsumo(
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

  private transitionFindUsuario(
    manager: EntityManager,
    input: { userId: string | undefined; sessionId: string | undefined },
  ): Promise<TransitionFindUsuarioRow[]> {
    return manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select('1 AS "1"')
      .innerJoin(UserSession, 's', 's.id_usuario=u.id_usuario')
      .where(
        'u.id_usuario=:userId AND s.id_sesion_usuario=:sessionId AND u.activo AND s.revocada_en IS NULL AND s.expira_en>clock_timestamp()',
      )
      .setLock('pessimistic_read', undefined, ['u', 's'])
      .setParameters({ userId: input.userId, sessionId: input.sessionId })
      .getRawMany<TransitionFindUsuarioRow>();
  }

  private async transitionFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string | undefined },
  ): Promise<TransitionFindUsuarioNextRow[]> {
    return (await this.authorization.hasPermission(
      manager,
      input.userId,
      'orders.manage',
    ))
      ? [{ '1': '1' }]
      : [];
  }

  private transitionFindPedidoNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindPedidoNextRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select(
        'o.estado, o.modalidad, o.origen, o.id_jornada, o.id_cuenta, v.id_version, v.numero',
      )
      .innerJoin(
        OrderVersion,
        'v',
        "v.id_pedido=o.id_pedido AND v.estado='current'",
      )
      .where('o.id_pedido=:id')
      .setLock('pessimistic_write', undefined, ['o', 'v'])
      .setParameters({ id: input.id })
      .getRawMany<TransitionFindPedidoNextRow>();
  }

  private transitionFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<TransitionFindCuentaConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('cuenta_consumo')
      .select('estado AS "estado"')
      .where('id_cuenta=:id_cuenta')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<TransitionFindCuentaConsumoRow>();
  }

  private transitionFindJornadaOperativa(
    manager: EntityManager,
    input: { id_jornada: string; zone: string },
  ): Promise<TransitionFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('1 AS "1"')
      .where(
        "id_jornada=:id_jornada AND estado='open' AND fecha_operativa=timezone(:zone,clock_timestamp())::date",
      )
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_jornada: input.id_jornada, zone: input.zone })
      .getRawMany<TransitionFindJornadaOperativaRow>();
  }

  private transitionFindLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<TransitionFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('l')
      .select('1 AS "1"')
      .innerJoin(Payment, 'p', 'p.id_liquidacion=l.id_liquidacion')
      .where(
        "l.id_cuenta=:id_cuenta AND l.estado='settled' AND p.metodo='transfer' AND p.estado='confirmed'",
      )
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<TransitionFindLiquidacionRow>();
  }

  private transitionFindPago(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<TransitionFindPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select('1 AS "1"')
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .where(
        "l.id_cuenta=:id_cuenta AND p.estado IN ('confirmed','pendingVerification')",
      )
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<TransitionFindPagoRow>();
  }

  private async transitionUpdateLiquidacion(
    manager: EntityManager,
    input: {
      id_cuenta: string;
      userId: string | undefined;
      reason: string | null;
    },
  ): Promise<void> {
    await manager
      .getRepository(Settlement)
      .createQueryBuilder()
      .update(Settlement)
      .set({
        estado: 'cancelled',
        anulada_por: input.userId,
        anulada_en: () => 'clock_timestamp()',
        motivo_anulacion: input.reason,
      })
      .where("id_cuenta=:id_cuenta AND estado='pending'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  private async transitionUpdateDetalleLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(SettlementItem)
      .createQueryBuilder()
      .update(SettlementItem)
      .set({ vigente: false })
      .where(
        'id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=:id_cuenta)',
      )
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  private transitionFindSolicitudCancelacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindSolicitudCancelacionRow[]> {
    return manager
      .getRepository(CancellationRequest)
      .createQueryBuilder('solicitud_cancelacion')
      .select('1 AS "1"')
      .where("id_pedido=:id AND estado='pending'")
      .setParameters({ id: input.id })
      .getRawMany<TransitionFindSolicitudCancelacionRow>();
  }

  private async transitionUpdatePedido(
    manager: EntityManager,
    input: { id: string; status: string },
  ): Promise<void> {
    await manager
      .getRepository(Order)
      .createQueryBuilder()
      .update(Order)
      .set({ estado: input.status })
      .where('id_pedido=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async transitionUpdateEntregaDomicilio(
    manager: EntityManager,
    parameters: unknown[],
    action: 'dispatch' | 'deliver',
  ): Promise<void> {
    const actor = parameters[1] as string;
    const values =
      action === 'dispatch'
        ? { despachado_en: () => 'clock_timestamp()', despachado_por: actor }
        : { entregado_en: () => 'clock_timestamp()', entregado_por: actor };
    await manager
      .getRepository(DeliveryDetails)
      .createQueryBuilder()
      .update()
      .set(values)
      .where('id_pedido=:id', { id: parameters[0] })
      .execute();
  }

  private async transitionInsertHistorialPedido(
    manager: EntityManager,
    input: {
      id: string;
      id_version: string;
      userId: string | null;
      guestSessionId: string | null;
      actorType: 'sesion_cliente' | 'usuario';
      event: string;
      estado: string;
      nextStatus: string;
      reason: string | null;
    },
  ): Promise<void> {
    await manager
      .getRepository(OrderHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.id,
          id_version: input.id_version,
          actor_usuario: input.userId,
          actor_sesion_cliente: input.guestSessionId,
          actor_tipo: input.actorType,
          evento: input.event,
          estado_anterior: input.estado,
          estado_nuevo: input.nextStatus,
          motivo: input.reason,
        },
      ])
      .execute();
  }
}
