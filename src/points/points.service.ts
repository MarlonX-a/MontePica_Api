import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { auditTableOperation } from '../tables/table-audit.js';
import { lockTableOperations } from '../tables/table-operations.js';
import { PointsRepository } from './repositories/points.repository.js';

export function calculateEarnedPoints(
  productsCents: bigint,
  rate: number,
): bigint {
  if (productsCents < 0n || !Number.isInteger(rate) || rate < 1 || rate > 1000)
    throw new ConflictException('Base o tasa inválida.');
  const points = (productsCents / 100n) * BigInt(rate);
  if (points > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ConflictException('Puntos exceden el rango permitido.');
  return points;
}

@Injectable()
export class PointsService {
  constructor(
    private readonly db: DataSource,
    private readonly idem: ParticipationIdempotencyService,
    private readonly persistence: PointsRepository = new PointsRepository(),
  ) {}
  async current(m: EntityManager = this.db.manager) {
    const [r] = await this.persistence.currentFindConfiguracionPuntos(m);
    return r;
  }
  async publicSettings() {
    const { configuredBy: _actor, ...settings } = await this.current();
    return settings;
  }
  async configure(
    enabled: boolean,
    rate: number,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    if (!Number.isSafeInteger(rate) || rate < 1 || rate > 1000)
      throw new BadRequestException('Tasa fuera del rango permitido.');
    return this.idem.run(
      { userId: actor.userId },
      'points/settings',
      key,
      { enabled, pointsPerDollar: rate },
      200,
      'configuracion_puntos',
      async (m) => {
        const [s] = await this.persistence.configureFindRolPermiso(m, {
          userId: actor.userId,
          sessionId: actor.sessionId,
        });
        if (!s || !s.activo || s.revocada_en || !s.valid)
          throw new UnauthorizedException('Sesión inválida.');
        if (!s.allowed) throw new ForbiddenException('Permiso insuficiente.');
      },
      async (m) => {
        await lockTableOperations(m);
        const old = await this.current(m);
        const [row] = await this.persistence.configureInsertConfiguracionPuntos(
          m,
          {
            version: old.version + 1,
            enabled: enabled,
            rate: rate,
            userId: actor.userId,
          },
        );
        const result = await this.current(m);
        await auditTableOperation(
          m,
          { userId: actor.userId },
          'configuracion_puntos',
          row.id,
          'points.settings_updated',
          { before: old, after: result },
        );
        return { resourceId: row.id, response: result };
      },
    );
  }
  async recordConfirmedPayment(m: EntityManager, paymentId: string) {
    const [p] =
      await this.persistence.recordConfirmedPaymentFindDetalleLiquidacion(m, {
        paymentId: paymentId,
      });
    if (!p || p.estado !== 'confirmed' || !p.id_cliente || !p.registered)
      return;
    const settings = await this.current(m);
    if (!settings.enabled) return;
    const cents = BigInt(p.products);
    const points = calculateEarnedPoints(cents, settings.pointsPerDollar);
    if (points > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ConflictException('Puntos exceden el rango permitido.');
    await this.persistence.recordConfirmedPaymentFindCliente(m, {
      id_cliente: p.id_cliente,
    });
    const state = p.modalidad === 'delivery' ? 'pending' : 'credited';
    const [a] =
      await this.persistence.recordConfirmedPaymentInsertAcumulacionPuntos(m, {
        paymentId: paymentId,
        id_cliente: p.id_cliente,
        version: settings.version,
        productsCents: cents.toString(),
        points: points.toString(),
        state: state,
      });
    await this.balance(p.id_cliente, m);
    if (a)
      await auditTableOperation(
        m,
        {},
        'acumulacion_puntos',
        a.id,
        'points.snapshot',
        { paymentId, points: Number(points), state },
      );
    if (a && state === 'credited' && points > 0n) {
      await this.persistence.recordConfirmedPaymentInsertMovimientoPuntos(m, {
        id_cliente: p.id_cliente,
        id: a.id,
        points: points.toString(),
      });
      await auditTableOperation(
        m,
        {},
        'movimiento_puntos',
        a.id,
        'points.earned',
        { paymentId, points: Number(points) },
      );
    }
  }
  async deliverOrder(m: EntityManager, orderId: string, actor: string) {
    const rows = await this.persistence.deliverOrderUpdateAcumulacionPuntos(m, {
      orderId: orderId,
    });
    const a = rows[0];
    if (a && Number(a.puntos) > 0) {
      await this.persistence.recordConfirmedPaymentInsertMovimientoPuntos(m, {
        id_cliente: a.id_cliente,
        id: a.id_acumulacion,
        points: a.puntos,
      });
      await this.balance(a.id_cliente, m);
      await auditTableOperation(
        m,
        { userId: actor },
        'movimiento_puntos',
        a.id_acumulacion,
        'points.earned',
        { paymentId: a.id_pago, points: Number(a.puntos) },
      );
    }
  }
  async refund(m: EntityManager, refundId: string, actor: string) {
    const [a] = await this.persistence.refundFindAcumulacionPuntos(m, {
      refundId: refundId,
    });
    if (!a || Number(a.puntos) === 0) return;
    await this.persistence.recordConfirmedPaymentFindCliente(m, {
      id_cliente: a.id_cliente,
    });
    await this.persistence.refundInsertMovimientoPuntos(m, {
      id_cliente: a.id_cliente,
      id_acumulacion: a.id_acumulacion,
      refundId: refundId,
      puntos: a.puntos,
    });
    await auditTableOperation(
      m,
      { userId: actor },
      'movimiento_puntos',
      refundId,
      'points.refund_adjusted',
      { points: Number(a.puntos) },
    );
    await this.balance(a.id_cliente, m);
  }
  async balance(clientId: string, m: EntityManager = this.db.manager) {
    await this.requireClient(clientId, m);
    const [r] = await this.persistence.balanceFindMovimientoPuntos(m, {
      clientId: clientId,
    });
    if (
      ![r.balance, r.pending, r.reserved].every((v) =>
        Number.isSafeInteger(Number(v)),
      )
    )
      throw new ConflictException('Saldo fuera del rango seguro.');
    const balance = Number(r.balance),
      reservedPoints = Number(r.reserved);
    const available = BigInt(r.balance) - BigInt(r.reserved);
    return {
      balance,
      pendingPoints: Number(r.pending),
      reservedPoints,
      availablePoints: Number(available > 0n ? available : 0n),
    };
  }
  private async requireClient(id: string, m: EntityManager = this.db.manager) {
    const [c] = await this.persistence.requireClientFindCliente(m, { id: id });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
  }
  async movements(
    clientId: string,
    q: { page: number; limit: number; type?: string; paymentId?: string },
  ) {
    await this.requireClient(clientId);
    return this.persistence.movements(this.db.manager, clientId, q);
  }
}
