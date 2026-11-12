import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { ConsumptionAssignment } from '../accounts/entities/consumption-assignment.entity.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { Category } from '../catalog/entities/category.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { DailyInventory } from '../inventory/entities/daily-inventory.entity.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../operations/entities/operations-settings.entity.js';
import { InventoryReservation } from '../orders/entities/inventory-reservation.entity.js';
import { OrderHistory } from '../orders/entities/order-history.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { OrderVersion } from '../orders/entities/order-version.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { PointsMovement } from '../points/entities/points-movement.entity.js';
import { Reward } from '../rewards/entities/reward.entity.js';
import {
  DecideFindMovimientoPuntosRow,
  DecideFindReservaInventarioCanjeRow,
  DecideFindSolicitudCanjeNextNextNextRow,
  DecideFindSolicitudCanjeNextNextRow,
  DecideFindSolicitudCanjeNextRow,
  DecideFindSolicitudCanjeRow,
  DecideInsertDetallePedidoRow,
  DecideInsertPedidoRow,
  DecideInsertVersionPedidoRow,
  RequestFindLiquidacionRow,
  StaffFindRolPermisoRow,
} from '../rewards/types/rewards.types.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { RestaurantTable } from '../tables/entities/restaurant-table.entity.js';
import { TableVisit } from '../visits/entities/table-visit.entity.js';
import { RedemptionInventoryReservation } from './entities/redemption-inventory-reservation.entity.js';
import { RedemptionPointsReservation } from './entities/redemption-points-reservation.entity.js';
import { RedemptionRequest } from './entities/redemption-request.entity.js';
import { RedemptionReservationsService } from './redemption-reservations.service.js';
import { RedemptionsQueryService } from './redemptions-query.service.js';

type Actor = { userId?: string; guestSessionId?: string; sessionId?: string };

@Injectable()
export class RedemptionDecisionService {
  constructor(
    private readonly idem: ParticipationIdempotencyService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
    private readonly queries: RedemptionsQueryService,
    private readonly reservations: RedemptionReservationsService,
  ) {}

  private async staff(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
    permission: string,
  ) {
    const [s] = await this.staffFindRolPermiso(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
      permission,
    });
    if (!s || !s.activo || s.revocada_en || !s.valid)
      throw new UnauthorizedException('Sesión inválida.');
    if (!s.allowed) throw new ForbiddenException('Permiso insuficiente.');
    return s.role as string;
  }

  private user(actor: Actor) {
    if (!actor.userId)
      throw new UnauthorizedException('Se requiere sesión de personal.');
    return { userId: actor.userId };
  }

  async decide(
    id: string,
    action: 'approve' | 'reject',
    actor: AuthenticatedRequestContext,
    key: string | undefined,
    reason?: string,
  ) {
    return this.idem.run(
      this.user(actor),
      `admin/redemptions/${id.toLowerCase()}/${action}`,
      key,
      { reason: reason ?? null },
      200,
      'solicitud_canje',
      (m) => this.staff(m, actor, 'redemptions.manage').then(() => undefined),
      async (m) => {
        const zone = await this.operationalContext.lockTableOperations(m);
        const [ref] = await this.decideFindSolicitudCanje(m, {
          id,
        });
        if (!ref) throw new NotFoundException('Canje no encontrado.');
        if (action === 'approve')
          await this.operationalContext.lockActiveVisit(m, ref.visit, zone);
        else await this.decideFindVisitaMesa(m, { visit: ref.visit });
        if (action === 'approve') {
          const [closed] = await this.decideFindSolicitudCanjeNext(m, {
            id,
          });
          if (closed)
            throw new ConflictException(
              'La caja de la jornada ya fue cerrada.',
            );
        }
        await this.requestFindCliente(m, { clientId: ref.client });
        await this.decideFindCuentaConsumo(m, {
          account: ref.account,
        });
        const [s] = await this.decideFindSolicitudCanjeNextNext(m, {
          id,
        });
        if (s.estado !== 'pending')
          throw new ConflictException('El canje ya fue resuelto.');
        if (action === 'reject') {
          await this.reservations.release(m, id, 'rejected');
          await this.decideUpdateSolicitudCanje(m, {
            id,
            reason,
            userId: actor.userId,
          });
          await this.reservations.history(
            m,
            id,
            actor.userId,
            'redemption.rejected',
            {
              reason,
            },
          );
          await this.auditLog.append(
            m,
            this.user(actor),
            'solicitud_canje',
            id,
            'redemption.rejected',
            { reason },
          );
          return {
            resourceId: id,
            response: await this.queries.redemption(id, undefined, m, true),
          };
        }
        const [valid] = await this.decideFindSolicitudCanjeNextNextNext(m, {
          id,
        });
        if (
          !valid.fresh ||
          valid.participant !== 'approved' ||
          valid.account !== 'open' ||
          valid.visit !== 'open' ||
          !valid.table_active ||
          valid.day_status !== 'open' ||
          !valid.current_day ||
          !valid.reward ||
          !valid.product_active ||
          !valid.visible_menu ||
          !valid.category_active
        )
          throw new ConflictException(
            'El canje o las condiciones operativas ya no están vigentes.',
          );
        const [bill] = await this.requestFindLiquidacion(m, {
          account: s.id_cuenta,
        });
        if (bill)
          throw new ConflictException(
            'La cuenta tiene una liquidación pendiente.',
          );
        const [balance] = await this.decideFindMovimientoPuntos(m, {
          id_cliente: s.id_cliente,
          id,
        });
        if (
          BigInt(balance.balance) - BigInt(balance.reserved) <
          BigInt(s.costo_puntos)
        )
          throw new ConflictException(
            'El saldo disponible ya no cubre este canje.',
          );
        const [inv] = await this.decideFindReservaInventarioCanje(m, {
          id,
        });
        if (valid.tracks && (!inv || inv.reservation_state !== 'active'))
          throw new ConflictException(
            'La reserva de existencias ya no está disponible.',
          );
        const [order] = await this.decideInsertPedido(m, {
          id_jornada: s.id_jornada,
          id_visita: s.id_visita,
          id_cuenta: s.id_cuenta,
          userId: actor.userId,
          id,
        });
        const [version] = await this.decideInsertVersionPedido(m, {
          id: order.id,
        });
        const [detail] = await this.decideInsertDetallePedido(m, {
          id: version.id,
          id_producto: s.id_producto,
          tracks: valid.tracks,
        });
        await this.decideInsertAsignacionConsumo(m, {
          id: detail.id,
          id_cuenta: s.id_cuenta,
        });
        if (valid.tracks) {
          await this.decideInsertReservaInventario(m, {
            id: detail.id,
            inventory: inv.inventory,
          });
          await this.decideUpdateReservaInventarioCanje(m, {
            id,
          });
        }
        await this.decideInsertMovimientoPuntos(m, {
          id_cliente: s.id_cliente,
          id,
          costo_puntos: s.costo_puntos,
        });
        await this.reservations.ensurePointBalance(s.id_cliente, m);
        await this.decideUpdateReservaPuntosCanje(m, { id });
        await this.decideInsertHistorialPedido(m, {
          id: order.id,
          id2: version.id,
          userId: actor.userId,
        });
        await this.decideUpdateSolicitudCanjeNext(m, {
          id,
          id2: order.id,
          userId: actor.userId,
        });
        await this.reservations.history(
          m,
          id,
          actor.userId,
          'redemption.approved',
          {
            orderId: order.id,
          },
        );
        await this.auditLog.append(
          m,
          this.user(actor),
          'solicitud_canje',
          id,
          'redemption.approved',
          { orderId: order.id, points: Number(s.costo_puntos) },
        );
        return {
          resourceId: id,
          response: await this.queries.redemption(id, undefined, m, true),
        };
      },
    );
  }

  private async staffFindRolPermiso(
    manager: EntityManager,
    input: { userId: string; sessionId: string; permission: string },
  ): Promise<StaffFindRolPermisoRow[]> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
      input.permission,
    );
    return row ? [row] : [];
  }

  private async requestFindLiquidacion(
    manager: EntityManager,
    input: { account: string },
  ): Promise<RequestFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('1 AS "1"')
      .where("id_cuenta=:account AND estado='pending'")
      .setParameters({ account: input.account })
      .getRawMany<RequestFindLiquidacionRow>();
  }

  private async requestFindCliente(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<void> {
    await manager
      .getRepository(Client)
      .createQueryBuilder('cliente')
      .select('1 AS "1"')
      .where('id_cliente=:clientId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ clientId: input.clientId })
      .getRawMany();
  }

  private async decideFindSolicitudCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select('id_visita visit, id_cliente client, id_cuenta account')
      .where('id_canje=:id')
      .setParameters({ id: input.id })
      .getRawMany<DecideFindSolicitudCanjeRow>();
  }

  private async decideFindVisitaMesa(
    manager: EntityManager,
    input: { visit: string },
  ): Promise<void> {
    await manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select('1 AS "1"')
      .where('id_visita=:visit')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ visit: input.visit })
      .getRawMany();
  }

  private async decideFindSolicitudCanjeNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCanjeNextRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('s')
      .select('1 AS "1"')
      .innerJoin(CashRegister, 'c', 'c.id_jornada=s.id_jornada')
      .where("s.id_canje=:id AND c.estado='closed'")
      .setParameters({ id: input.id })
      .getRawMany<DecideFindSolicitudCanjeNextRow>();
  }

  private async decideFindCuentaConsumo(
    manager: EntityManager,
    input: { account: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('cuenta_consumo')
      .select('1 AS "1"')
      .where('id_cuenta=:account')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ account: input.account })
      .getRawMany();
  }

  private async decideFindSolicitudCanjeNextNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCanjeNextNextRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select([
        '"solicitud_canje"."id_canje" AS "id_canje"',
        '"solicitud_canje"."creado_por" AS "creado_por"',
        '"solicitud_canje"."id_cuenta" AS "id_cuenta"',
        '"solicitud_canje"."id_producto" AS "id_producto"',
        '"solicitud_canje"."id_recompensa" AS "id_recompensa"',
        '"solicitud_canje"."id_participante" AS "id_participante"',
        '"solicitud_canje"."creada_en" AS "creada_en"',
        '"solicitud_canje"."version_recompensa" AS "version_recompensa"',
        '"solicitud_canje"."id_jornada" AS "id_jornada"',
        '"solicitud_canje"."expira_en" AS "expira_en"',
        '"solicitud_canje"."id_visita" AS "id_visita"',
        '"solicitud_canje"."resuelta_en" AS "resuelta_en"',
        '"solicitud_canje"."motivo" AS "motivo"',
        '"solicitud_canje"."id_pedido" AS "id_pedido"',
        '"solicitud_canje"."estado" AS "estado"',
        '"solicitud_canje"."controla_stock" AS "controla_stock"',
        '"solicitud_canje"."id_cliente" AS "id_cliente"',
        '"solicitud_canje"."costo_puntos" AS "costo_puntos"',
        '"solicitud_canje"."resuelto_por" AS "resuelto_por"',
      ])
      .where('id_canje=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<DecideFindSolicitudCanjeNextNextRow>();
  }

  private async decideUpdateSolicitudCanje(
    manager: EntityManager,
    input: { id: string; reason: string | undefined; userId: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder()
      .update(RedemptionRequest)
      .set({ motivo: input.reason, resuelto_por: input.userId })
      .where('id_canje=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async decideFindSolicitudCanjeNextNextNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCanjeNextNextNextRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('s')
      .select(
        's.expira_en>clock_timestamp() fresh, p.estado participant, c.estado account, v.estado visit, t.activa table_active, j.estado day_status, cfg.zona_horaria zone, j.fecha_operativa=timezone(cfg.zona_horaria,clock_timestamp())::date current_day, r.activa reward, pd.activo product_active, pd.visible_menu, cg.activa category_active, s.controla_stock tracks',
      )
      .innerJoin(Participant, 'p', 'p.id_participante=s.id_participante')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=s.id_cuenta')
      .innerJoin(TableVisit, 'v', 'v.id_visita=s.id_visita')
      .innerJoin(RestaurantTable, 't', 't.id_mesa=v.id_mesa')
      .innerJoin(OperatingDay, 'j', 'j.id_jornada=s.id_jornada')
      .innerJoin(OperationsSettings, 'cfg', 'cfg.id_configuracion=1')
      .innerJoin(Reward, 'r', 'r.id_recompensa=s.id_recompensa')
      .innerJoin(Product, 'pd', 'pd.id_producto=s.id_producto')
      .innerJoin(Category, 'cg', 'cg.id_categoria=pd.id_categoria')
      .where('s.id_canje=:id')
      .setParameters({ id: input.id })
      .getRawMany<DecideFindSolicitudCanjeNextNextNextRow>();
  }

  private async decideFindMovimientoPuntos(
    manager: EntityManager,
    input: { id_cliente: string; id: string },
  ): Promise<DecideFindMovimientoPuntosRow[]> {
    return manager
      .createQueryBuilder()
      .select(
        "COALESCE((SELECT sum(puntos) FROM movimiento_puntos WHERE id_cliente=:id_cliente),0)::text balance, COALESCE((SELECT sum(puntos) FROM reserva_puntos_canje WHERE id_cliente=:id_cliente AND estado='active' AND id_canje<>:id),0)::text reserved",
      )
      .from('(SELECT 1)', '_singleton')
      .setParameters({ id_cliente: input.id_cliente, id: input.id })
      .getRawMany<DecideFindMovimientoPuntosRow>();
  }

  private async decideFindReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindReservaInventarioCanjeRow[]> {
    return manager
      .getRepository(RedemptionInventoryReservation)
      .createQueryBuilder('ric')
      .select(
        'ric.id_reserva reservation, ric.id_inventario inventory, ric.estado reservation_state, i.cantidad_fisica physical, i.cantidad_reservada reserved',
      )
      .innerJoin(DailyInventory, 'i', 'i.id_inventario=ric.id_inventario')
      .where('ric.id_canje=:id')
      .setLock('pessimistic_write', undefined, ['ric', 'i'])
      .setParameters({ id: input.id })
      .getRawMany<DecideFindReservaInventarioCanjeRow>();
  }

  private async decideInsertPedido(
    manager: EntityManager,
    input: {
      id_jornada: string;
      id_visita: string;
      id_cuenta: string;
      userId: string;
      id: string;
    },
  ): Promise<DecideInsertPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_jornada: input.id_jornada,
          id_visita: input.id_visita,
          id_cuenta: input.id_cuenta,
          actor_usuario: input.userId,
          modalidad: 'local',
          origen: 'reward',
          estado: 'submitted',
          id_canje: input.id,
        },
      ])
      .returning('id_pedido id')
      .execute()
      .then((result) => result.raw);
  }

  private async decideInsertVersionPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideInsertVersionPedidoRow[]> {
    return manager
      .getRepository(OrderVersion)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.id,
          numero: 1,
          estado: 'current',
          total_productos_ctvs: String(0),
        },
      ])
      .returning('id_version id')
      .execute()
      .then((result) => result.raw);
  }

  private async decideInsertDetallePedido(
    manager: EntityManager,
    input: { id: string; id_producto: string; tracks: boolean },
  ): Promise<DecideInsertDetallePedidoRow[]> {
    return manager
      .getRepository(OrderItem)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_version: input.id,
          id_producto: input.id_producto,
          cantidad: 1,
          precio_unitario_ctvs: 0,
          controla_stock_snapshot: input.tracks,
        },
      ])
      .returning('id_detalle id')
      .execute()
      .then((result) => result.raw);
  }

  private async decideInsertAsignacionConsumo(
    manager: EntityManager,
    input: { id: string; id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder()
      .insert()
      .values([
        { id_detalle: input.id, id_cuenta: input.id_cuenta, cantidad: 1 },
      ])
      .execute();
  }

  private async decideInsertReservaInventario(
    manager: EntityManager,
    input: { id: string; inventory: string },
  ): Promise<void> {
    await manager
      .getRepository(InventoryReservation)
      .createQueryBuilder()
      .insert()
      .values([
        { id_detalle: input.id, id_inventario: input.inventory, cantidad: 1 },
      ])
      .execute();
  }

  private async decideUpdateReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionInventoryReservation)
      .createQueryBuilder()
      .update(RedemptionInventoryReservation)
      .set({ estado: 'transferred', resuelta_en: () => 'clock_timestamp()' })
      .where('id_canje=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async decideInsertMovimientoPuntos(
    manager: EntityManager,
    input: { id_cliente: string; id: string; costo_puntos: string },
  ): Promise<void> {
    await manager
      .getRepository(PointsMovement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.id_cliente,
          id_canje: input.id,
          tipo: 'redeem',
          puntos: () => '-:costo_puntos::bigint',
        },
      ])
      .setParameters({ costo_puntos: input.costo_puntos })
      .execute();
  }

  private async decideUpdateReservaPuntosCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionPointsReservation)
      .createQueryBuilder()
      .update(RedemptionPointsReservation)
      .set({ estado: 'consumed', resuelta_en: () => 'clock_timestamp()' })
      .where("id_canje=:id AND estado='active'")
      .setParameters({ id: input.id })
      .execute();
  }

  private async decideInsertHistorialPedido(
    manager: EntityManager,
    input: { id: string; id2: string; userId: string },
  ): Promise<void> {
    await manager
      .getRepository(OrderHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.id,
          id_version: input.id2,
          actor_usuario: input.userId,
          actor_tipo: 'usuario',
          evento: 'order.reward_submitted',
          estado_nuevo: 'submitted',
        },
      ])
      .execute();
  }

  private async decideUpdateSolicitudCanjeNext(
    manager: EntityManager,
    input: { id: string; id2: string; userId: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder()
      .update(RedemptionRequest)
      .set({
        estado: 'approved',
        id_pedido: input.id2,
        resuelto_por: input.userId,
        resuelta_en: () => 'clock_timestamp()',
      })
      .where('id_canje=:id')
      .setParameters({ id: input.id })
      .execute();
  }
}
