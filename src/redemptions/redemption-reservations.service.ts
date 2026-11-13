import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditService } from '../common/audit/audit.service.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { DailyInventory } from '../inventory/entities/daily-inventory.entity.js';
import { PointsMovement } from '../points/entities/points-movement.entity.js';
import {
  EnsurePointBalanceFindMovimientoPuntosRow,
  RefundForOrderFindSolicitudCanjeRow,
  RefundForOrderInsertMovimientoPuntosRow,
  ReleaseFindReservaInventarioCanjeRow,
  ReleaseForOperatingDayFindSolicitudCanjeRow,
  ReleaseForParticipantFindSolicitudCanjeRow,
  ReleaseForVisitFindSolicitudCanjeRow,
} from '../rewards/types/rewards.types.js';
import { RedemptionHistory } from './entities/redemption-history.entity.js';
import { RedemptionInventoryReservation } from './entities/redemption-inventory-reservation.entity.js';
import { RedemptionPointsReservation } from './entities/redemption-points-reservation.entity.js';
import { RedemptionRequest } from './entities/redemption-request.entity.js';

type Actor = { userId?: string; guestSessionId?: string; sessionId?: string };

@Injectable()
export class RedemptionReservationsService {
  constructor(private readonly auditLog: AuditService) {}

  async history(
    m: EntityManager,
    id: string,
    user: string | undefined,
    event: string,
    detail: object = {},
  ) {
    await this.historyInsertHistorialCanje(m, {
      id,
      user: user ?? null,
      event,
      detail: JSON.stringify(detail),
    });
  }

  async release(
    m: EntityManager,
    id: string,
    status: 'rejected' | 'cancelled' | 'expired',
  ) {
    const [inv] = await this.releaseFindReservaInventarioCanje(m, {
      id,
    });
    if (inv) {
      await this.releaseUpdateInventarioDiario(m, {
        inventory: inv.inventory,
      });
      await this.releaseUpdateReservaInventarioCanje(m, { id });
    }
    await this.releaseUpdateReservaPuntosCanje(m, { id });
    await this.releaseUpdateSolicitudCanje(m, {
      id,
      status,
    });
  }

  async releaseForParticipant(m: EntityManager, participantId: string) {
    const rows = await this.releaseForParticipantFindSolicitudCanje(m, {
      participantId,
    });
    for (const r of rows) {
      await this.release(m, r.id, 'cancelled');
      await this.history(m, r.id, undefined, 'redemption.participant_left');
      await this.auditLog.append(
        m,
        {},
        'solicitud_canje',
        r.id,
        'redemption.participant_left',
        {},
      );
    }
  }

  async releaseForVisit(m: EntityManager, visitId: string) {
    const rows = await this.releaseForVisitFindSolicitudCanje(m, {
      visitId,
    });
    for (const r of rows) {
      await this.release(m, r.id, 'cancelled');
      await this.history(m, r.id, undefined, 'redemption.visit_closed');
      await this.auditLog.append(
        m,
        {},
        'solicitud_canje',
        r.id,
        'redemption.visit_closed',
        {},
      );
    }
  }

  async releaseForOperatingDay(
    m: EntityManager,
    dayId: string,
    event:
      | 'redemption.cash_closed'
      | 'redemption.day_closed' = 'redemption.cash_closed',
  ) {
    const rows = await this.releaseForOperatingDayFindSolicitudCanje(m, {
      dayId,
    });
    for (const r of rows) {
      await this.release(m, r.id, 'cancelled');
      await this.history(m, r.id, undefined, event);
      await this.auditLog.append(m, {}, 'solicitud_canje', r.id, event, {
        operatingDayId: dayId,
      });
    }
  }

  async refundForOrder(m: EntityManager, orderId: string, actor: Actor) {
    const [r] = await this.refundForOrderFindSolicitudCanje(m, {
      orderId,
    });
    if (!r || r.estado !== 'approved') return;
    await this.requestFindCliente(m, { clientId: r.client });
    const [inserted] = await this.refundForOrderInsertMovimientoPuntos(m, {
      client: r.client,
      id: r.id,
      points: r.points,
    });
    if (inserted) {
      await this.history(m, r.id, actor.userId, 'redemption.points_returned', {
        orderId,
        points: Number(r.points),
      });
      await this.auditLog.append(
        m,
        actor,
        'solicitud_canje',
        r.id,
        'redemption.points_returned',
        { orderId, points: Number(r.points) },
      );
      await this.ensurePointBalance(r.client, m);
    }
  }

  async ensurePointBalance(clientId: string, m: EntityManager) {
    const [r] = await this.ensurePointBalanceFindMovimientoPuntos(m, {
      clientId,
    });
    if (!Number.isSafeInteger(Number(r.balance)))
      throw new ConflictException('Saldo de puntos excede el rango seguro.');
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

  private async historyInsertHistorialCanje(
    manager: EntityManager,
    input: { id: string; user: string | null; event: string; detail: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_canje: input.id,
          actor_usuario: input.user,
          evento: input.event,
          detalle: () => ':detail::jsonb',
        },
      ])
      .setParameters({ detail: input.detail })
      .execute();
  }

  private releaseFindReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<ReleaseFindReservaInventarioCanjeRow[]> {
    return manager
      .getRepository(RedemptionInventoryReservation)
      .createQueryBuilder('reserva_inventario_canje')
      .select('id_inventario inventory')
      .where("id_canje=:id AND estado='active'")
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<ReleaseFindReservaInventarioCanjeRow>();
  }

  private async releaseUpdateInventarioDiario(
    manager: EntityManager,
    input: { inventory: string },
  ): Promise<void> {
    await manager
      .getRepository(DailyInventory)
      .createQueryBuilder()
      .update(DailyInventory)
      .set({ cantidad_reservada: () => 'cantidad_reservada-1' })
      .where('id_inventario=:inventory')
      .setParameters({ inventory: input.inventory })
      .execute();
  }

  private async releaseUpdateReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionInventoryReservation)
      .createQueryBuilder()
      .update(RedemptionInventoryReservation)
      .set({ estado: 'released', resuelta_en: () => 'clock_timestamp()' })
      .where('id_canje=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async releaseUpdateReservaPuntosCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionPointsReservation)
      .createQueryBuilder()
      .update(RedemptionPointsReservation)
      .set({ estado: 'released', resuelta_en: () => 'clock_timestamp()' })
      .where("id_canje=:id AND estado='active'")
      .setParameters({ id: input.id })
      .execute();
  }

  private async releaseUpdateSolicitudCanje(
    manager: EntityManager,
    input: { id: string; status: 'rejected' | 'cancelled' | 'expired' },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder()
      .update(RedemptionRequest)
      .set({
        estado: input.status,
        resuelto_por: null,
        resuelta_en: () => 'clock_timestamp()',
      })
      .where('id_canje=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private releaseForParticipantFindSolicitudCanje(
    manager: EntityManager,
    input: { participantId: string },
  ): Promise<ReleaseForParticipantFindSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select('id_canje id')
      .where("id_participante=:participantId AND estado='pending'")
      .addOrderBy('id_canje', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ participantId: input.participantId })
      .getRawMany<ReleaseForParticipantFindSolicitudCanjeRow>();
  }

  private releaseForVisitFindSolicitudCanje(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<ReleaseForVisitFindSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select('id_canje id')
      .where("id_visita=:visitId AND estado='pending'")
      .addOrderBy('id_cliente', 'ASC')
      .addOrderBy('id_canje', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ visitId: input.visitId })
      .getRawMany<ReleaseForVisitFindSolicitudCanjeRow>();
  }

  private releaseForOperatingDayFindSolicitudCanje(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<ReleaseForOperatingDayFindSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select('id_canje id')
      .where("id_jornada=:dayId AND estado='pending'")
      .addOrderBy('id_cliente', 'ASC')
      .addOrderBy('id_canje', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ dayId: input.dayId })
      .getRawMany<ReleaseForOperatingDayFindSolicitudCanjeRow>();
  }

  private refundForOrderFindSolicitudCanje(
    manager: EntityManager,
    input: { orderId: string },
  ): Promise<RefundForOrderFindSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select('id_canje id, id_cliente client, costo_puntos points, estado')
      .where('id_pedido=:orderId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ orderId: input.orderId })
      .getRawMany<RefundForOrderFindSolicitudCanjeRow>();
  }

  private refundForOrderInsertMovimientoPuntos(
    manager: EntityManager,
    input: { client: string; id: string; points: string },
  ): Promise<RefundForOrderInsertMovimientoPuntosRow[]> {
    return manager
      .getRepository(PointsMovement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.client,
          id_canje: input.id,
          tipo: 'redemptionReturn',
          puntos: String(input.points),
        },
      ])
      .onConflict('(id_canje,tipo) WHERE id_canje IS NOT NULL DO NOTHING')
      .returning('id_movimiento')
      .execute()
      .then((result) => result.raw);
  }

  private ensurePointBalanceFindMovimientoPuntos(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<EnsurePointBalanceFindMovimientoPuntosRow[]> {
    return manager
      .getRepository(PointsMovement)
      .createQueryBuilder('movimiento_puntos')
      .select('COALESCE(sum(puntos),0)::text balance')
      .where('id_cliente=:clientId')
      .setParameters({ clientId: input.clientId })
      .getRawMany<EnsurePointBalanceFindMovimientoPuntosRow>();
  }
}
