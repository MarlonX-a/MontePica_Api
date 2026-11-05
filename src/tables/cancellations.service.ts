import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';

import { RewardsService } from '../rewards/rewards.service.js';
import type {
  CancellationCreateDto,
  CancellationListDto,
} from './cancellations.dto.js';
import type { ClientIdentity } from './client-access.guard.js';
import { ParticipantsService } from './participants.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';

import { CancellationsRepository } from './repositories/cancellations.repository.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';

@Injectable()
export class CancellationsService {
  constructor(
    private readonly db: DataSource,
    private readonly idem: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly rewards: RewardsService,
    private readonly persistence: CancellationsRepository = new CancellationsRepository(),
  ) {}
  private async staff(
    m: EntityManager,
    a: AuthenticatedRequestContext,
    permission: string,
    admin = false,
  ) {
    const [s] = await this.persistence.staffFindUsuario(m, {
      userId: a.userId,
      sessionId: a.sessionId,
    });
    if (!s || !s.activo || s.revocada_en || !s.valid)
      throw new UnauthorizedException('Sesion invalida.');
    if (admin && s.role !== 'admin')
      throw new ForbiddenException(
        'Solo el administrador puede decidir cancelaciones.',
      );
    const [p] = await this.persistence.staffFindUsuarioNext(m, {
      userId: a.userId,
      permission: permission,
    });
    if (!p) throw new ForbiddenException('Permiso insuficiente.');
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
          const [o] = await this.persistence.createFindPedido(m, {
            orderId: orderId,
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
        await lockTableOperations(m);
        const [o] = await this.persistence.createFindPedidoNext(m, {
          orderId: orderId,
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
        const [pay] = await this.persistence.createFindLiquidacion(m, {
          id_cuenta: o.id_cuenta,
        });
        if (pay)
          throw new ConflictException(
            'Existe una transferencia pendiente de revision.',
          );
        const [duplicate] =
          await this.persistence.createFindSolicitudCancelacion(m, {
            orderId: orderId,
          });
        if (duplicate)
          throw new ConflictException('Ya existe una solicitud pendiente.');
        if (o.modalidad === 'delivery' && o.estado === 'submitted') {
          const [paid] = await this.persistence.createFindLiquidacionNext(m, {
            id_cuenta: o.id_cuenta,
          });
          if (!paid)
            throw new ConflictException(
              'Utiliza la anulacion directa para pedidos sin pago.',
            );
        }
        const [r] = await this.persistence.createInsertSolicitudCancelacion(m, {
          orderId: orderId,
          id_version: o.id_version,
          estado: o.estado,
          reason: dto.reason,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
          requestedByClient: !!client,
        });
        await this.persistence.createInsertHistorialCancelacion(m, {
          id: r.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
        });
        await auditTableOperation(
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
    m: EntityManager = this.db.manager,
  ) {
    const [r] = await this.persistence.detailFindSolicitudCancelacion(m, {
      id: id,
      clientId: clientId ?? null,
    });
    if (!r) throw new NotFoundException('Solicitud no encontrada.');
    if (clientId) {
      delete r.requestedBy;
      delete r.decidedBy;
    } else
      r.history = await this.persistence.detailFindHistorialCancelacion(m, {
        id: id,
      });
    return r;
  }
  async list(q: CancellationListDto, clientId?: string) {
    const { rows, total } = await this.persistence.listCancellationIds(
      this.db.manager,
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
        await lockTableOperations(m);
        const [r] = await this.persistence.decideFindSolicitudCancelacion(m, {
          id: id,
        });
        if (!r) throw new NotFoundException('Solicitud no encontrada.');
        const [currentVersion] = await this.persistence.decideFindVersionPedido(
          m,
          { id_pedido: r.id_pedido },
        );
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
          const [pending] = await this.persistence.decideFindPago(m, {
            id_cuenta: r.id_cuenta,
          });
          if (pending)
            throw new ConflictException('Existe transferencia pendiente.');
          await this.persistence.decideUpdatePedido(m, {
            id_pedido: r.id_pedido,
          });
          await this.rewards.refundForOrder(m, r.id_pedido, {
            userId: a.userId,
          });
          await this.persistence.decideInsertHistorialPedido(m, {
            id_pedido: r.id_pedido,
            id_version: r.id_version,
            userId: a.userId,
            current_order: r.current_order,
          });
          await this.persistence.decideLockReservaInventario(m, {
            id_version: r.id_version,
          });
          await this.persistence.decideUpdateAsignacionConsumo(m, {
            id_version: r.id_version,
          });
          await this.persistence.decideUpdateLiquidacion(m, {
            id_cuenta: r.id_cuenta,
            userId: a.userId,
          });
          await this.persistence.decideUpdateDetalleLiquidacion(m, {
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
            const [d] = await this.persistence.decideInsertDevolucion(m, {
              id: id,
              id_pago: r.id_pago,
              id_pedido: r.id_pedido,
              amount: amount,
              userId: a.userId,
            });
            await this.persistence.decideInsertHistorialDevolucion(m, {
              id: d.id,
              userId: a.userId,
              detailJson: JSON.stringify({
                cancellationRequestId: id,
                paymentId: r.id_pago,
                amountCents: amount,
              }),
            });
            refund = { id: d.id, amountCents: amount, status: 'pending' };
            await this.persistence.decideUpdateCuentaConsumo(m, {
              id_cuenta: r.id_cuenta,
            });
            await this.persistence.decideUpdateAcumulacionPuntos(m, {
              id_pago: r.id_pago,
            });
          }
        }
        await this.persistence.decideUpdateSolicitudCancelacion(m, {
          id: id,
          status: status,
          userId: a.userId || null,
          rejectionReason: decision === 'reject' ? reason : null,
        });
        await this.persistence.decideInsertHistorialCancelacion(m, {
          id: id,
          userId: a.userId || null,
          guestSessionId: client?.guestSessionId ?? null,
          decision: decision,
        });
        await auditTableOperation(
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
}
