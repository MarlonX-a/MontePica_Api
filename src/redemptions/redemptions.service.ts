import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { UserSession } from '../auth/entities/user-session.entity.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { Category } from '../catalog/entities/category.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { type ClientIdentity } from '../common/identity/client-access.guard.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { DailyInventory } from '../inventory/entities/daily-inventory.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { PointsMovement } from '../points/entities/points-movement.entity.js';
import { Reward } from '../rewards/entities/reward.entity.js';
import {
  CancelFindSolicitudCanjeNextRow,
  CancelFindSolicitudCanjeRow,
  ClientFindClienteRow,
  RequestFindCajaRow,
  RequestFindInventarioDiarioRow,
  RequestFindLiquidacionRow,
  RequestFindMovimientoPuntosRow,
  RequestFindParticipanteNextRow,
  RequestFindParticipanteRow,
  RequestFindRecompensaRow,
  RequestFindReservaPuntosCanjeRow,
  RequestInsertSolicitudCanjeRow,
} from '../rewards/types/rewards.types.js';
import { Role } from '../roles/entities/role.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { User } from '../users/entities/user.entity.js';
import { type CreateRedemptionDto } from './dto/create-redemption.dto.js';
import { RedemptionInventoryReservation } from './entities/redemption-inventory-reservation.entity.js';
import { RedemptionPointsReservation } from './entities/redemption-points-reservation.entity.js';
import { RedemptionRequest } from './entities/redemption-request.entity.js';
import { RedemptionReservationsService } from './redemption-reservations.service.js';
import { RedemptionsQueryService } from './redemptions-query.service.js';

type Actor = { userId?: string; guestSessionId?: string; sessionId?: string };

@Injectable()
export class RedemptionsService {
  constructor(
    private readonly idem: ParticipationIdempotencyService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly queries: RedemptionsQueryService,
    private readonly reservations: RedemptionReservationsService,
  ) {}

  private async client(m: EntityManager, actor: ClientIdentity) {
    if (!actor.userId)
      throw new UnauthorizedException('Se requiere una cuenta registrada.');
    const [s] = await this.clientFindCliente(m, {
      clientId: actor.clientId,
      userId: actor.userId,
      userSessionId: actor.userSessionId,
    });
    if (!s) throw new UnauthorizedException('Sesión inválida.');
  }

  private user(actor: Actor) {
    if (!actor.userId)
      throw new UnauthorizedException('Se requiere sesión de personal.');
    return { userId: actor.userId };
  }

  async request(
    visitId: string,
    dto: CreateRedemptionDto,
    client: ClientIdentity,
    key?: string,
  ) {
    const actor = this.user({ userId: client.userId });
    return this.idem.run(
      actor,
      `visits/${visitId.toLowerCase()}/redemptions`,
      key,
      dto,
      201,
      'solicitud_canje',
      async (m) => {
        await this.client(m, client);
        const [own] = await this.requestFindParticipante(m, {
          visitId,
          clientId: client.clientId,
        });
        if (!own) throw new NotFoundException('Participación no encontrada.');
      },
      async (m) => {
        const zone = await this.operationalContext.lockTableOperations(m);
        await this.operationalContext.lockActiveVisit(m, visitId, zone);
        const [participant] = await this.requestFindParticipanteNext(m, {
          visitId,
          clientId: client.clientId,
        });
        if (!participant)
          throw new NotFoundException('Participación no encontrada.');
        if (
          participant.status !== 'approved' ||
          participant.account_status !== 'open'
        )
          throw new ConflictException(
            'Se requiere una participación aprobada y cuenta abierta.',
          );
        const [cash] = await this.requestFindCaja(m, {
          dayId: participant.dayId,
        });
        if (cash?.estado === 'closed')
          throw new ConflictException('La caja de la jornada ya fue cerrada.');
        const [bill] = await this.requestFindLiquidacion(m, {
          account: participant.account,
        });
        if (bill)
          throw new ConflictException(
            'La cuenta tiene una liquidación pendiente.',
          );
        const [reward] = await this.requestFindRecompensa(m, {
          rewardId: dto.rewardId,
        });
        if (!reward) throw new NotFoundException('Recompensa no disponible.');
        if (reward.version !== dto.rewardVersion)
          throw new ConflictException('La versión de la recompensa cambió.');
        await this.requestFindCliente(m, {
          clientId: client.clientId,
        });
        const [bal] = await this.requestFindMovimientoPuntos(m, {
          clientId: client.clientId,
        });
        const [reserved] = await this.requestFindReservaPuntosCanje(m, {
          clientId: client.clientId,
        });
        if (
          BigInt(bal.balance) - BigInt(reserved.total) <
          BigInt(reward.costo_puntos)
        )
          throw new ConflictException('Puntos disponibles insuficientes.');
        let stock: { id: string; available: number } | undefined;
        if (reward.tracks) {
          [stock] = await this.requestFindInventarioDiario(m, {
            dayId: participant.dayId,
            id_producto: reward.id_producto,
          });
          if (!stock || stock.available < 1)
            throw new ConflictException(
              'Inventario insuficiente o sin inicializar.',
            );
        }
        const [canje] = await this.requestInsertSolicitudCanje(m, {
          clientId: client.clientId,
          id: participant.id,
          account: participant.account,
          visitId,
          dayId: participant.dayId,
          rewardId: dto.rewardId,
          version: reward.version,
          id_producto: reward.id_producto,
          tracks: reward.tracks,
          costo_puntos: reward.costo_puntos,
          userId: client.userId,
        });
        await this.requestInsertReservaPuntosCanje(m, {
          id: canje.id,
          clientId: client.clientId,
          costo_puntos: reward.costo_puntos,
        });
        if (reward.tracks) {
          await this.requestUpdateInventarioDiario(m, {
            id: stock!.id,
          });
          await this.requestInsertReservaInventarioCanje(m, {
            id: canje.id,
            id2: stock!.id,
          });
        }
        await this.reservations.history(
          m,
          canje.id,
          client.userId,
          'redemption.requested',
          {
            rewardId: dto.rewardId,
            points: Number(reward.costo_puntos),
            tracksInventory: reward.tracks,
          },
        );
        await this.auditLog.append(
          m,
          actor,
          'solicitud_canje',
          canje.id,
          'redemption.requested',
          {
            clientId: client.clientId,
            rewardId: dto.rewardId,
            points: Number(reward.costo_puntos),
          },
        );
        return {
          resourceId: canje.id,
          response: await this.queries.redemption(canje.id, client.clientId, m),
        };
      },
    );
  }

  async cancel(id: string, client: ClientIdentity, key?: string) {
    const actor = this.user({ userId: client.userId });
    return this.idem.run(
      actor,
      `me/redemptions/${id.toLowerCase()}/cancel`,
      key,
      {},
      200,
      'solicitud_canje',
      async (m) => {
        await this.client(m, client);
        const [own] = await this.cancelFindSolicitudCanje(m, {
          id,
          clientId: client.clientId,
        });
        if (!own) throw new NotFoundException('Canje no encontrado.');
      },
      async (m) => {
        await this.operationalContext.lockTableOperations(m);
        await this.requestFindCliente(m, {
          clientId: client.clientId,
        });
        const [s] = await this.cancelFindSolicitudCanjeNext(m, {
          id,
          clientId: client.clientId,
        });
        if (!s) throw new NotFoundException('Canje no encontrado.');
        if (s.estado !== 'pending')
          throw new ConflictException('El canje ya fue resuelto.');
        await this.reservations.release(m, id, 'cancelled');
        await this.cancelUpdateSolicitudCanje(m, {
          id,
          userId: client.userId,
        });
        await this.reservations.history(
          m,
          id,
          client.userId,
          'redemption.cancelled',
        );
        await this.auditLog.append(
          m,
          actor,
          'solicitud_canje',
          id,
          'redemption.cancelled',
          {},
        );
        return {
          resourceId: id,
          response: await this.queries.redemption(id, client.clientId, m),
        };
      },
    );
  }

  private clientFindCliente(
    manager: EntityManager,
    input: {
      clientId: string;
      userId: string;
      userSessionId: string | undefined;
    },
  ): Promise<ClientFindClienteRow[]> {
    return manager
      .getRepository(Client)
      .createQueryBuilder('c')
      .select('1 AS "1"')
      .innerJoin(User, 'u', 'u.id_usuario=c.id_usuario')
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .innerJoin(UserSession, 'se', 'se.id_usuario=u.id_usuario')
      .where(
        "c.id_cliente=:clientId AND u.id_usuario=:userId AND u.activo AND r.codigo='client' AND se.id_sesion_usuario=:userSessionId AND se.revocada_en IS NULL AND se.expira_en>clock_timestamp()",
      )
      .setLock('pessimistic_read', undefined, ['u', 'se'])
      .setParameters({
        clientId: input.clientId,
        userId: input.userId,
        userSessionId: input.userSessionId,
      })
      .getRawMany<ClientFindClienteRow>();
  }

  private requestFindParticipante(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<RequestFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select('1 AS "1"')
      .where('id_visita=:visitId AND id_cliente=:clientId')
      .setParameters({ visitId: input.visitId, clientId: input.clientId })
      .getRawMany<RequestFindParticipanteRow>();
  }

  private requestFindParticipanteNext(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<RequestFindParticipanteNextRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('p')
      .select(
        'p.id_participante id, p.id_cliente client, p.estado status, c.id_cuenta account, c.id_jornada "dayId", c.estado account_status',
      )
      .innerJoin(ConsumptionAccount, 'c', 'c.id_participante=p.id_participante')
      .where('p.id_visita=:visitId AND p.id_cliente=:clientId')
      .setLock('pessimistic_write', undefined, ['p', 'c'])
      .setParameters({ visitId: input.visitId, clientId: input.clientId })
      .getRawMany<RequestFindParticipanteNextRow>();
  }

  private requestFindCaja(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<RequestFindCajaRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('caja')
      .select('estado AS "estado"')
      .where('id_jornada=:dayId')
      .setParameters({ dayId: input.dayId })
      .getRawMany<RequestFindCajaRow>();
  }

  private requestFindLiquidacion(
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

  private requestFindRecompensa(
    manager: EntityManager,
    input: { rewardId: string },
  ): Promise<RequestFindRecompensaRow[]> {
    return manager
      .getRepository(Reward)
      .createQueryBuilder('r')
      .select('r.*, p.controla_inventario tracks')
      .innerJoin(Product, 'p', 'p.id_producto=r.id_producto')
      .innerJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where(
        'r.id_recompensa=:rewardId AND r.activa AND p.activo AND p.visible_menu AND c.activa',
      )
      .setLock('pessimistic_read', undefined, ['r', 'p', 'c'])
      .setParameters({ rewardId: input.rewardId })
      .getRawMany<RequestFindRecompensaRow>();
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

  private requestFindMovimientoPuntos(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<RequestFindMovimientoPuntosRow[]> {
    return manager
      .getRepository(PointsMovement)
      .createQueryBuilder('movimiento_puntos')
      .select('COALESCE(sum(puntos),0)::text balance')
      .where('id_cliente=:clientId')
      .setParameters({ clientId: input.clientId })
      .getRawMany<RequestFindMovimientoPuntosRow>();
  }

  private requestFindReservaPuntosCanje(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<RequestFindReservaPuntosCanjeRow[]> {
    return manager
      .getRepository(RedemptionPointsReservation)
      .createQueryBuilder('reserva_puntos_canje')
      .select('COALESCE(sum(puntos),0)::text total')
      .where("id_cliente=:clientId AND estado='active'")
      .setParameters({ clientId: input.clientId })
      .getRawMany<RequestFindReservaPuntosCanjeRow>();
  }

  private requestFindInventarioDiario(
    manager: EntityManager,
    input: { dayId: string; id_producto: string },
  ): Promise<RequestFindInventarioDiarioRow[]> {
    return manager
      .getRepository(DailyInventory)
      .createQueryBuilder('inventario_diario')
      .select('id_inventario id, cantidad_fisica-cantidad_reservada available')
      .where('id_jornada=:dayId AND id_producto=:id_producto')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ dayId: input.dayId, id_producto: input.id_producto })
      .getRawMany<RequestFindInventarioDiarioRow>();
  }

  private requestInsertSolicitudCanje(
    manager: EntityManager,
    input: {
      clientId: string;
      id: string;
      account: string;
      visitId: string;
      dayId: string;
      rewardId: string;
      version: number;
      id_producto: string;
      tracks: boolean;
      costo_puntos: string;
      userId: string | undefined;
    },
  ): Promise<RequestInsertSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.clientId,
          id_participante: input.id,
          id_cuenta: input.account,
          id_visita: input.visitId,
          id_jornada: input.dayId,
          id_recompensa: input.rewardId,
          version_recompensa: input.version,
          id_producto: input.id_producto,
          controla_stock: input.tracks,
          costo_puntos: String(input.costo_puntos),
          expira_en: () => "clock_timestamp()+interval '15 minutes'",
          creado_por: input.userId,
        },
      ])
      .returning('id_canje id,expira_en "expiresAt"')
      .execute()
      .then((result) => result.raw);
  }

  private async requestInsertReservaPuntosCanje(
    manager: EntityManager,
    input: { id: string; clientId: string; costo_puntos: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionPointsReservation)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_canje: input.id,
          id_cliente: input.clientId,
          puntos: String(input.costo_puntos),
        },
      ])
      .execute();
  }

  private async requestUpdateInventarioDiario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(DailyInventory)
      .createQueryBuilder()
      .update(DailyInventory)
      .set({ cantidad_reservada: () => 'cantidad_reservada+1' })
      .where('id_inventario=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async requestInsertReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string; id2: string },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionInventoryReservation)
      .createQueryBuilder()
      .insert()
      .values([{ id_canje: input.id, id_inventario: input.id2 }])
      .execute();
  }

  private cancelFindSolicitudCanje(
    manager: EntityManager,
    input: { id: string; clientId: string },
  ): Promise<CancelFindSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select('1 AS "1"')
      .where('id_canje=:id AND id_cliente=:clientId')
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<CancelFindSolicitudCanjeRow>();
  }

  private cancelFindSolicitudCanjeNext(
    manager: EntityManager,
    input: { id: string; clientId: string },
  ): Promise<CancelFindSolicitudCanjeNextRow[]> {
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
      .where('id_canje=:id AND id_cliente=:clientId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<CancelFindSolicitudCanjeNextRow>();
  }

  private async cancelUpdateSolicitudCanje(
    manager: EntityManager,
    input: { id: string; userId: string | undefined },
  ): Promise<void> {
    await manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder()
      .update(RedemptionRequest)
      .set({ resuelto_por: input.userId })
      .where('id_canje=:id')
      .setParameters({ id: input.id })
      .execute();
  }
}
