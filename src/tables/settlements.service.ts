import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { SettlementsRepository } from './repositories/settlements.repository.js';
import type { AccountListDto, SettlementListDto } from './settlements.dto.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly db: DataSource,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly persistence: SettlementsRepository = new SettlementsRepository(),
  ) {}

  private async authorize(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
  ) {
    const [user] = await this.persistence.authorizeFindUsuario(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
    if (!user || !user.activo || user.revocada_en || !user.valid)
      throw new UnauthorizedException('Sesión no válida.');
    const [permission] = await this.persistence.authorizeFindUsuarioNext(m, {
      userId: actor.userId,
    });
    if (!permission)
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción.',
      );
  }

  async account(
    id: string,
    clientId?: string,
    m: EntityManager = this.db.manager,
  ) {
    const [account] = await this.persistence.accountFindCuentaConsumo(m, {
      id: id,
      clientId: clientId ?? null,
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    account.items = await this.persistence.accountFindAsignacionConsumo(m, {
      id: id,
    });
    account.totalCents = account.items.reduce(
      (sum: number, item: { subtotalCents: number }) =>
        sum + item.subtotalCents,
      0,
    );
    account.currency = 'USD';
    const [totals] = await this.persistence.accountFindDetalleLiquidacion(m, {
      id: id,
    });
    account.productsCents = account.totalCents;
    const [shipping] = await this.persistence.accountFindLiquidacion(m, {
      id: id,
    });
    account.shippingCents = shipping.fee;
    account.totalCents += shipping.fee;
    totals.paid += shipping.paid;
    totals.resolved += shipping.paid;
    account.paidCents = totals.paid;
    account.pendingCents = Math.max(0, account.totalCents - totals.resolved);
    const [refund] = await this.persistence.accountFindDevolucion(m, {
      id: id,
    });
    account.refundPendingCents = refund.pending;
    account.refundedCents = refund.completed;
    const [pending] = await this.persistence.accountFindLiquidacionNext(m, {
      id: id,
    });
    account.pendingSettlement = pending ?? null;
    return account;
  }

  async settlement(
    id: string,
    clientId?: string,
    m: EntityManager = this.db.manager,
  ) {
    const [row] = await this.persistence.settlementFindPago(m, {
      id: id,
      clientId: clientId ?? null,
    });
    if (!row) throw new NotFoundException('Liquidación no encontrada.');
    row.items = await this.persistence.settlementFindDetalleLiquidacion(m, {
      id: id,
    });
    return row;
  }

  async accounts(query: AccountListDto, clientId?: string) {
    const { rows, total } = await this.persistence.listAccountIds(
      this.db.manager,
      query,
      clientId,
    );
    return {
      items: await Promise.all(
        rows.map((row) => this.account(row.id, clientId)),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async settlements(query: SettlementListDto) {
    const { rows, total } = await this.persistence.listSettlementIds(
      this.db.manager,
      query,
    );
    return {
      items: await Promise.all(rows.map((row) => this.settlement(row.id))),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async create(
    accountId: string,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idempotency.run(
      { userId: actor.userId },
      `accounts/${accountId.toLowerCase()}/settlements`,
      key,
      {},
      201,
      'liquidacion',
      (m) => this.authorize(m, actor),
      async (m) => {
        const zone = await lockTableOperations(m);
        const [day] = await this.persistence.createFindJornadaOperativa(m, {
          zone: zone,
        });
        if (!day)
          throw new ConflictException(
            'Se requiere jornada y caja actuales abiertas.',
          );
        const [account] = await this.persistence.createFindCuentaConsumo(m, {
          accountId: accountId,
        });
        if (!account) throw new NotFoundException('Cuenta no encontrada.');
        if (account.modalidad === 'delivery')
          throw new ConflictException(
            'La liquidación del domicilio se genera con su pedido.',
          );
        if (account.estado !== 'open')
          throw new ConflictException('La cuenta está cerrada.');
        const [existing] = await this.persistence.createFindLiquidacion(m, {
          accountId: accountId,
        });
        if (existing)
          throw new ConflictException(
            'La cuenta ya tiene una liquidación pendiente.',
          );
        const [cancellation] =
          await this.persistence.createFindSolicitudCancelacion(m, {
            accountId: accountId,
          });
        if (cancellation)
          throw new ConflictException(
            'Hay una solicitud de cancelacion pendiente.',
          );
        const [unfinished] = await this.persistence.createFindPedido(m, {
          accountId: accountId,
        });
        if (unfinished)
          throw new ConflictException(
            'Todos los pedidos deben estar entregados.',
          );
        const items: Array<{ id: string; quantity: number; price: number }> =
          await this.persistence.createFindAsignacionConsumo(m, {
            accountId: accountId,
          });
        if (!items.length)
          throw new ConflictException('La cuenta no tiene consumo pendiente.');
        const total = items.reduce(
          (sum, item) => sum + item.quantity * item.price,
          0,
        );
        if (!Number.isSafeInteger(total))
          throw new ConflictException('El total supera el límite permitido.');
        const [settlement] = await this.persistence.createInsertLiquidacion(m, {
          accountId: accountId,
          cash: day.cash,
          total: total,
          userId: actor.userId,
        });
        for (const item of items)
          await this.persistence.createInsertDetalleLiquidacion(m, {
            id: settlement.id,
            id2: item.id,
            quantity: item.quantity,
            price: item.price,
            quantity5: item.quantity * item.price,
          });
        await auditTableOperation(
          m,
          { userId: actor.userId },
          'liquidacion',
          settlement.id,
          'settlement.created',
          { accountId, cashRegisterId: day.cash, totalCents: total },
        );
        return {
          resourceId: settlement.id,
          response: await this.settlement(settlement.id, undefined, m),
        };
      },
    );
  }

  async cancel(
    id: string,
    reason: string,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idempotency.run(
      { userId: actor.userId },
      `settlements/${id.toLowerCase()}/cancel`,
      key,
      { reason },
      200,
      'liquidacion',
      (m) => this.authorize(m, actor),
      async (m) => {
        await lockTableOperations(m);
        const [ref] = await this.persistence.cancelFindLiquidacion(m, {
          id: id,
        });
        if (!ref) throw new NotFoundException('Liquidación no encontrada.');
        const [account] = await this.persistence.cancelFindCuentaConsumo(m, {
          id_cuenta: ref.id_cuenta,
        });
        if (account.modalidad === 'delivery')
          throw new ConflictException('Debe anularse el pedido de domicilio.');
        const [row] = await this.persistence.cancelFindLiquidacionNext(m, {
          id: id,
        });
        if (row.estado !== 'pending')
          throw new ConflictException('La liquidación ya fue anulada.');
        const [pendingTransfer] = await this.persistence.cancelFindPago(m, {
          id: id,
        });
        if (pendingTransfer)
          throw new ConflictException(
            'Existe una transferencia pendiente de verificación.',
          );
        await this.persistence.cancelUpdateLiquidacion(m, {
          id: id,
          userId: actor.userId,
          reason: reason,
        });
        await this.persistence.cancelUpdateDetalleLiquidacion(m, { id: id });
        await auditTableOperation(
          m,
          { userId: actor.userId },
          'liquidacion',
          id,
          'settlement.cancelled',
          { reason, accountId: ref.id_cuenta },
        );
        return {
          resourceId: id,
          response: await this.settlement(id, undefined, m),
        };
      },
    );
  }
}
