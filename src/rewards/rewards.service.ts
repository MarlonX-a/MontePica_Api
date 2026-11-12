import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import type { ClientIdentity } from '../tables/client-access.guard.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { auditTableOperation } from '../tables/table-audit.js';
import {
  lockActiveVisit,
  lockTableOperations,
} from '../tables/table-operations.js';
import { RewardsRepository } from './repositories/rewards.repository.js';
import type {
  AdminRedemptionListDto,
  CreateRedemptionDto,
  RedemptionListDto,
  RewardCreateDto,
  RewardListDto,
  RewardUpdateDto,
} from './rewards.dto.js';

type Actor = { userId?: string; guestSessionId?: string; sessionId?: string };

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);
  private expiryTimer?: ReturnType<typeof setInterval>;
  private expiryRunning = false;
  constructor(
    private readonly db: DataSource,
    private readonly idem: ParticipationIdempotencyService,
    private readonly persistence: RewardsRepository = new RewardsRepository(),
  ) {}

  onModuleInit() {
    void this.expirePending().catch((error) =>
      this.logger.error(
        'No se pudieron procesar los vencimientos de canjes.',
        error instanceof Error ? error.stack : undefined,
      ),
    );
    this.expiryTimer = setInterval(
      () =>
        void this.expirePending().catch((error) =>
          this.logger.error(
            'Falló el ciclo de vencimientos de canjes.',
            error instanceof Error ? error.stack : undefined,
          ),
        ),
      60_000,
    );
    this.expiryTimer.unref?.();
  }
  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  async staff(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
    permission: string,
  ) {
    const [s] = await this.persistence.staffFindRolPermiso(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
      permission: permission,
    });
    if (!s || !s.activo || s.revocada_en || !s.valid)
      throw new UnauthorizedException('Sesión inválida.');
    if (!s.allowed) throw new ForbiddenException('Permiso insuficiente.');
    return s.role as string;
  }
  private async client(m: EntityManager, actor: ClientIdentity) {
    if (!actor.userId)
      throw new UnauthorizedException('Se requiere una cuenta registrada.');
    const [s] = await this.persistence.clientFindCliente(m, {
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

  async createReward(
    dto: RewardCreateDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idem.run(
      this.user(actor),
      'admin/rewards',
      key,
      dto,
      201,
      'recompensa',
      (m) => this.staff(m, actor, 'rewards.manage').then(() => undefined),
      async (m) => {
        await lockTableOperations(m);
        const [product] = await this.persistence.createRewardFindProducto(m, {
          productId: dto.productId,
        });
        if (!product) throw new NotFoundException('Producto no encontrado.');
        const [row] = await this.persistence.createRewardInsertRecompensa(m, {
          name: dto.name,
          description: dto.description ?? null,
          productId: dto.productId,
          pointsCost: dto.pointsCost,
          active: dto.active,
          sortOrder: dto.sortOrder,
        });
        await auditTableOperation(
          m,
          this.user(actor),
          'recompensa',
          row.id,
          'reward.created',
          {
            name: dto.name,
            productId: dto.productId,
            pointsCost: dto.pointsCost,
            active: dto.active,
            sortOrder: dto.sortOrder,
          },
        );
        return {
          resourceId: row.id,
          response: await this.reward(row.id, true, m),
        };
      },
    );
  }
  async updateReward(
    id: string,
    dto: RewardUpdateDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    const changes = Object.fromEntries(
      Object.entries(dto).filter(
        ([k, v]) => k !== 'expectedVersion' && v !== undefined,
      ),
    );
    if (!Object.keys(changes).length)
      throw new BadRequestException('Envía al menos un campo modificable.');
    return this.idem.run(
      this.user(actor),
      `admin/rewards/${id.toLowerCase()}`,
      key,
      dto,
      200,
      'recompensa',
      (m) => this.staff(m, actor, 'rewards.manage').then(() => undefined),
      async (m) => {
        await lockTableOperations(m);
        const [old] = await this.persistence.updateRewardFindRecompensa(m, {
          id: id,
        });
        if (!old) throw new NotFoundException('Recompensa no encontrada.');
        if (old.version !== dto.expectedVersion)
          throw new ConflictException('La versión de la recompensa cambió.');
        const updatedRows = await this.persistence.updateRewardUpdateRecompensa(
          m,
          {
            id: id,
            name: dto.name,
            description: dto.description !== undefined,
            description4: dto.description ?? null,
            pointsCost: dto.pointsCost,
            active: dto.active,
            sortOrder: dto.sortOrder,
          },
        );
        await auditTableOperation(
          m,
          this.user(actor),
          'recompensa',
          id,
          'reward.updated',
          {
            before: {
              name: old.nombre,
              description: old.descripcion,
              pointsCost: Number(old.costo_puntos),
              active: old.activa,
              sortOrder: old.orden,
              version: old.version,
            },
            after: changes,
          },
        );
        return {
          resourceId: updatedRows[0].id,
          response: await this.reward(id, true, m),
        };
      },
    );
  }
  private async reward(
    id: string,
    admin: boolean,
    m: EntityManager = this.db.manager,
  ) {
    const [r] = await this.persistence.rewardFindRecompensa(m, { id: id });
    if (
      !r ||
      (!admin &&
        (!r.active ||
          !r.product_active ||
          !r.product_visible ||
          !r.category_active))
    )
      throw new NotFoundException('Recompensa no encontrada.');
    delete r.product_active;
    delete r.product_visible;
    delete r.category_active;
    return r;
  }
  async listRewards(q: RewardListDto, admin = false) {
    return this.persistence.listRewards(this.db.manager, q, admin);
  }
  publicReward(id: string) {
    return this.reward(id, false);
  }
  adminReward(id: string) {
    return this.reward(id, true);
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
        const [own] = await this.persistence.requestFindParticipante(m, {
          visitId: visitId,
          clientId: client.clientId,
        });
        if (!own) throw new NotFoundException('Participación no encontrada.');
      },
      async (m) => {
        const zone = await lockTableOperations(m);
        await lockActiveVisit(m, visitId, zone);
        const [participant] =
          await this.persistence.requestFindParticipanteNext(m, {
            visitId: visitId,
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
        const [cash] = await this.persistence.requestFindCaja(m, {
          dayId: participant.dayId,
        });
        if (cash?.estado === 'closed')
          throw new ConflictException('La caja de la jornada ya fue cerrada.');
        const [bill] = await this.persistence.requestFindLiquidacion(m, {
          account: participant.account,
        });
        if (bill)
          throw new ConflictException(
            'La cuenta tiene una liquidación pendiente.',
          );
        const [reward] = await this.persistence.requestFindRecompensa(m, {
          rewardId: dto.rewardId,
        });
        if (!reward) throw new NotFoundException('Recompensa no disponible.');
        if (reward.version !== dto.rewardVersion)
          throw new ConflictException('La versión de la recompensa cambió.');
        await this.persistence.requestFindCliente(m, {
          clientId: client.clientId,
        });
        const [bal] = await this.persistence.requestFindMovimientoPuntos(m, {
          clientId: client.clientId,
        });
        const [reserved] = await this.persistence.requestFindReservaPuntosCanje(
          m,
          { clientId: client.clientId },
        );
        if (
          BigInt(bal.balance) - BigInt(reserved.total) <
          BigInt(reward.costo_puntos)
        )
          throw new ConflictException('Puntos disponibles insuficientes.');
        let stock: { id: string; available: number } | undefined;
        if (reward.tracks) {
          [stock] = await this.persistence.requestFindInventarioDiario(m, {
            dayId: participant.dayId,
            id_producto: reward.id_producto,
          });
          if (!stock || stock.available < 1)
            throw new ConflictException(
              'Inventario insuficiente o sin inicializar.',
            );
        }
        const [canje] = await this.persistence.requestInsertSolicitudCanje(m, {
          clientId: client.clientId,
          id: participant.id,
          account: participant.account,
          visitId: visitId,
          dayId: participant.dayId,
          rewardId: dto.rewardId,
          version: reward.version,
          id_producto: reward.id_producto,
          tracks: reward.tracks,
          costo_puntos: reward.costo_puntos,
          userId: client.userId,
        });
        await this.persistence.requestInsertReservaPuntosCanje(m, {
          id: canje.id,
          clientId: client.clientId,
          costo_puntos: reward.costo_puntos,
        });
        if (reward.tracks) {
          await this.persistence.requestUpdateInventarioDiario(m, {
            id: stock!.id,
          });
          await this.persistence.requestInsertReservaInventarioCanje(m, {
            id: canje.id,
            id2: stock!.id,
          });
        }
        await this.history(m, canje.id, client.userId, 'redemption.requested', {
          rewardId: dto.rewardId,
          points: Number(reward.costo_puntos),
          tracksInventory: reward.tracks,
        });
        await auditTableOperation(
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
          response: await this.redemption(canje.id, client.clientId, m),
        };
      },
    );
  }
  private async history(
    m: EntityManager,
    id: string,
    user: string | undefined,
    event: string,
    detail: object = {},
  ) {
    await this.persistence.historyInsertHistorialCanje(m, {
      id: id,
      user: user ?? null,
      event: event,
      detail: JSON.stringify(detail),
    });
  }
  async redemption(
    id: string,
    clientId?: string,
    m: EntityManager = this.db.manager,
    includeHistory = false,
  ) {
    const [r] = await this.persistence.redemptionFindSolicitudCanje(m, {
      id: id,
      clientId: clientId ?? null,
    });
    if (!r) throw new NotFoundException('Canje no encontrado.');
    if (includeHistory)
      r.history = await this.persistence.redemptionFindHistorialCanje(m, {
        id: id,
      });
    return r;
  }
  async listRedemptions(
    q: RedemptionListDto | AdminRedemptionListDto,
    clientId?: string,
  ) {
    const { rows, total } = await this.persistence.listRedemptionIds(
      this.db.manager,
      q,
      clientId,
    );
    const items = await Promise.all(
      rows.map((x: { id: string }) => this.redemption(x.id, clientId)),
    );
    return { items, total, page: q.page, limit: q.limit };
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
        const [own] = await this.persistence.cancelFindSolicitudCanje(m, {
          id: id,
          clientId: client.clientId,
        });
        if (!own) throw new NotFoundException('Canje no encontrado.');
      },
      async (m) => {
        await lockTableOperations(m);
        await this.persistence.requestFindCliente(m, {
          clientId: client.clientId,
        });
        const [s] = await this.persistence.cancelFindSolicitudCanjeNext(m, {
          id: id,
          clientId: client.clientId,
        });
        if (!s) throw new NotFoundException('Canje no encontrado.');
        if (s.estado !== 'pending')
          throw new ConflictException('El canje ya fue resuelto.');
        await this.release(m, id, 'cancelled');
        await this.persistence.cancelUpdateSolicitudCanje(m, {
          id: id,
          userId: client.userId,
        });
        await this.history(m, id, client.userId, 'redemption.cancelled');
        await auditTableOperation(
          m,
          actor,
          'solicitud_canje',
          id,
          'redemption.cancelled',
          {},
        );
        return {
          resourceId: id,
          response: await this.redemption(id, client.clientId, m),
        };
      },
    );
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
        const zone = await lockTableOperations(m);
        const [ref] = await this.persistence.decideFindSolicitudCanje(m, {
          id: id,
        });
        if (!ref) throw new NotFoundException('Canje no encontrado.');
        if (action === 'approve') await lockActiveVisit(m, ref.visit, zone);
        else
          await this.persistence.decideFindVisitaMesa(m, { visit: ref.visit });
        if (action === 'approve') {
          const [closed] = await this.persistence.decideFindSolicitudCanjeNext(
            m,
            { id: id },
          );
          if (closed)
            throw new ConflictException(
              'La caja de la jornada ya fue cerrada.',
            );
        }
        await this.persistence.requestFindCliente(m, { clientId: ref.client });
        await this.persistence.decideFindCuentaConsumo(m, {
          account: ref.account,
        });
        const [s] = await this.persistence.decideFindSolicitudCanjeNextNext(m, {
          id: id,
        });
        if (s.estado !== 'pending')
          throw new ConflictException('El canje ya fue resuelto.');
        if (action === 'reject') {
          await this.release(m, id, 'rejected');
          await this.persistence.decideUpdateSolicitudCanje(m, {
            id: id,
            reason: reason,
            userId: actor.userId,
          });
          await this.history(m, id, actor.userId, 'redemption.rejected', {
            reason,
          });
          await auditTableOperation(
            m,
            this.user(actor),
            'solicitud_canje',
            id,
            'redemption.rejected',
            { reason },
          );
          return {
            resourceId: id,
            response: await this.redemption(id, undefined, m, true),
          };
        }
        const [valid] =
          await this.persistence.decideFindSolicitudCanjeNextNextNext(m, {
            id: id,
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
        const [bill] = await this.persistence.requestFindLiquidacion(m, {
          account: s.id_cuenta,
        });
        if (bill)
          throw new ConflictException(
            'La cuenta tiene una liquidación pendiente.',
          );
        const [balance] = await this.persistence.decideFindMovimientoPuntos(m, {
          id_cliente: s.id_cliente,
          id: id,
        });
        if (
          BigInt(balance.balance) - BigInt(balance.reserved) <
          BigInt(s.costo_puntos)
        )
          throw new ConflictException(
            'El saldo disponible ya no cubre este canje.',
          );
        const [inv] = await this.persistence.decideFindReservaInventarioCanje(
          m,
          { id: id },
        );
        if (valid.tracks && (!inv || inv.reservation_state !== 'active'))
          throw new ConflictException(
            'La reserva de existencias ya no está disponible.',
          );
        const [order] = await this.persistence.decideInsertPedido(m, {
          id_jornada: s.id_jornada,
          id_visita: s.id_visita,
          id_cuenta: s.id_cuenta,
          userId: actor.userId,
          id: id,
        });
        const [version] = await this.persistence.decideInsertVersionPedido(m, {
          id: order.id,
        });
        const [detail] = await this.persistence.decideInsertDetallePedido(m, {
          id: version.id,
          id_producto: s.id_producto,
          tracks: valid.tracks,
        });
        await this.persistence.decideInsertAsignacionConsumo(m, {
          id: detail.id,
          id_cuenta: s.id_cuenta,
        });
        if (valid.tracks) {
          await this.persistence.decideInsertReservaInventario(m, {
            id: detail.id,
            inventory: inv.inventory,
          });
          await this.persistence.decideUpdateReservaInventarioCanje(m, {
            id: id,
          });
        }
        await this.persistence.decideInsertMovimientoPuntos(m, {
          id_cliente: s.id_cliente,
          id: id,
          costo_puntos: s.costo_puntos,
        });
        await this.ensurePointBalance(s.id_cliente, m);
        await this.persistence.decideUpdateReservaPuntosCanje(m, { id: id });
        await this.persistence.decideInsertHistorialPedido(m, {
          id: order.id,
          id2: version.id,
          userId: actor.userId,
        });
        await this.persistence.decideUpdateSolicitudCanjeNext(m, {
          id: id,
          id2: order.id,
          userId: actor.userId,
        });
        await this.history(m, id, actor.userId, 'redemption.approved', {
          orderId: order.id,
        });
        await auditTableOperation(
          m,
          this.user(actor),
          'solicitud_canje',
          id,
          'redemption.approved',
          { orderId: order.id, points: Number(s.costo_puntos) },
        );
        return {
          resourceId: id,
          response: await this.redemption(id, undefined, m, true),
        };
      },
    );
  }
  private async release(
    m: EntityManager,
    id: string,
    status: 'rejected' | 'cancelled' | 'expired',
  ) {
    const [inv] = await this.persistence.releaseFindReservaInventarioCanje(m, {
      id: id,
    });
    if (inv) {
      await this.persistence.releaseUpdateInventarioDiario(m, {
        inventory: inv.inventory,
      });
      await this.persistence.releaseUpdateReservaInventarioCanje(m, { id: id });
    }
    await this.persistence.releaseUpdateReservaPuntosCanje(m, { id: id });
    await this.persistence.releaseUpdateSolicitudCanje(m, {
      id: id,
      status: status,
    });
  }
  async releaseForParticipant(m: EntityManager, participantId: string) {
    const rows = await this.persistence.releaseForParticipantFindSolicitudCanje(
      m,
      { participantId: participantId },
    );
    for (const r of rows) {
      await this.release(m, r.id, 'cancelled');
      await this.history(m, r.id, undefined, 'redemption.participant_left');
      await auditTableOperation(
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
    const rows = await this.persistence.releaseForVisitFindSolicitudCanje(m, {
      visitId: visitId,
    });
    for (const r of rows) {
      await this.release(m, r.id, 'cancelled');
      await this.history(m, r.id, undefined, 'redemption.visit_closed');
      await auditTableOperation(
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
    const rows =
      await this.persistence.releaseForOperatingDayFindSolicitudCanje(m, {
        dayId: dayId,
      });
    for (const r of rows) {
      await this.release(m, r.id, 'cancelled');
      await this.history(m, r.id, undefined, event);
      await auditTableOperation(m, {}, 'solicitud_canje', r.id, event, {
        operatingDayId: dayId,
      });
    }
  }
  async refundForOrder(m: EntityManager, orderId: string, actor: Actor) {
    const [r] = await this.persistence.refundForOrderFindSolicitudCanje(m, {
      orderId: orderId,
    });
    if (!r || r.estado !== 'approved') return;
    await this.persistence.requestFindCliente(m, { clientId: r.client });
    const [inserted] =
      await this.persistence.refundForOrderInsertMovimientoPuntos(m, {
        client: r.client,
        id: r.id,
        points: r.points,
      });
    if (inserted) {
      await this.history(m, r.id, actor.userId, 'redemption.points_returned', {
        orderId,
        points: Number(r.points),
      });
      await auditTableOperation(
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
  private async ensurePointBalance(clientId: string, m: EntityManager) {
    const [r] = await this.persistence.ensurePointBalanceFindMovimientoPuntos(
      m,
      { clientId: clientId },
    );
    if (!Number.isSafeInteger(Number(r.balance)))
      throw new ConflictException('Saldo de puntos excede el rango seguro.');
  }
  async expirePending() {
    if (this.expiryRunning || !this.db.isInitialized) return;
    this.expiryRunning = true;
    try {
      const attempted: string[] = [];
      while (true) {
        const ids: Array<{ id: string }> =
          await this.persistence.expirePendingFindSolicitudCanje(
            this.db.manager,
            { attempted: attempted },
          );
        if (!ids.length) break;
        for (const row of ids) {
          attempted.push(row.id);
          try {
            await this.db.transaction(async (m) => {
              await lockTableOperations(m);
              const [s] =
                await this.persistence.expirePendingFindSolicitudCanjeNext(m, {
                  id: row.id,
                });
              if (!s) return;
              await this.release(m, row.id, 'expired');
              await this.history(m, row.id, undefined, 'redemption.expired');
              await auditTableOperation(
                m,
                {},
                'solicitud_canje',
                row.id,
                'redemption.expired',
                {},
              );
            });
          } catch (error) {
            this.logger.error(
              `No se pudo vencer un canje pendiente.`,
              error instanceof Error ? error.stack : undefined,
            );
          }
        }
      }
    } finally {
      this.expiryRunning = false;
    }
  }
}
