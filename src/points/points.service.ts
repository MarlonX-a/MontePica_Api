import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { auditTableOperation } from '../tables/table-audit.js';
import { lockTableOperations } from '../tables/table-operations.js';

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
  ) {}
  async current(m: EntityManager = this.db.manager) {
    const [r] = await m.query(
      `SELECT version,habilitado AS enabled,tasa_por_dolar AS "pointsPerDollar",configurada_por AS "configuredBy",creada_en AS "createdAt" FROM configuracion_puntos ORDER BY version DESC LIMIT 1`,
    );
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
        const [s] = await m.query(
          `SELECT u.activo,se.revocada_en,se.expira_en>clock_timestamp() valid,EXISTS(SELECT 1 FROM rol_permiso rp JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE rp.id_rol=u.id_rol AND p.codigo='points.configure') allowed FROM usuario u JOIN sesion_usuario se ON se.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND se.id_sesion_usuario=$2 FOR SHARE OF u,se`,
          [actor.userId, actor.sessionId],
        );
        if (!s || !s.activo || s.revocada_en || !s.valid)
          throw new UnauthorizedException('Sesión inválida.');
        if (!s.allowed) throw new ForbiddenException('Permiso insuficiente.');
      },
      async (m) => {
        await lockTableOperations(m);
        const old = await this.current(m);
        const [row] = await m.query(
          `INSERT INTO configuracion_puntos(version,habilitado,tasa_por_dolar,configurada_por) VALUES($1,$2,$3,$4) RETURNING id_configuracion id`,
          [old.version + 1, enabled, rate, actor.userId],
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
    const [p] = await m.query(
      `SELECT p.id_pago,p.estado,l.id_cuenta,(SELECT COALESCE(sum(dl.importe_ctvs),0)::text FROM detalle_liquidacion dl WHERE dl.id_liquidacion=l.id_liquidacion) products,c.id_cliente,c.modalidad,(cl.id_usuario IS NOT NULL) registered FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta LEFT JOIN cliente cl ON cl.id_cliente=c.id_cliente WHERE p.id_pago=$1 FOR UPDATE OF p,c`,
      [paymentId],
    );
    if (!p || p.estado !== 'confirmed' || !p.id_cliente || !p.registered)
      return;
    const settings = await this.current(m);
    if (!settings.enabled) return;
    const cents = BigInt(p.products);
    const points = calculateEarnedPoints(cents, settings.pointsPerDollar);
    if (points > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ConflictException('Puntos exceden el rango permitido.');
    await m.query('SELECT 1 FROM cliente WHERE id_cliente=$1 FOR UPDATE', [
      p.id_cliente,
    ]);
    const state = p.modalidad === 'delivery' ? 'pending' : 'credited';
    const [a] = await m.query(
      `INSERT INTO acumulacion_puntos(id_pago,id_cliente,id_configuracion,productos_ctvs,puntos,estado,acreditada_en) VALUES($1,$2,(SELECT id_configuracion FROM configuracion_puntos WHERE version=$3),$4,$5,$6,CASE WHEN $6::varchar='credited' THEN clock_timestamp() END) ON CONFLICT(id_pago) DO NOTHING RETURNING id_acumulacion id`,
      [
        paymentId,
        p.id_cliente,
        settings.version,
        cents.toString(),
        points.toString(),
        state,
      ],
    );
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
      await m.query(
        `INSERT INTO movimiento_puntos(id_cliente,id_acumulacion,tipo,puntos) VALUES($1,$2,'earn',$3)`,
        [p.id_cliente, a.id, points.toString()],
      );
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
    const [rows] = await m.query(
      `UPDATE acumulacion_puntos ap SET estado='credited',acreditada_en=clock_timestamp() FROM pago p,liquidacion l,pedido o WHERE ap.id_pago=p.id_pago AND p.id_liquidacion=l.id_liquidacion AND l.id_cuenta=o.id_cuenta AND o.id_pedido=$1 AND ap.estado='pending' RETURNING ap.id_acumulacion,ap.id_cliente,ap.puntos,ap.id_pago`,
      [orderId],
    );
    const a = rows[0];
    if (a && Number(a.puntos) > 0) {
      await m.query(
        `INSERT INTO movimiento_puntos(id_cliente,id_acumulacion,tipo,puntos) VALUES($1,$2,'earn',$3)`,
        [a.id_cliente, a.id_acumulacion, a.puntos],
      );
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
    const [a] = await m.query(
      `SELECT ap.id_acumulacion,ap.id_cliente,ap.puntos FROM acumulacion_puntos ap JOIN devolucion d ON d.id_pago=ap.id_pago WHERE d.id_devolucion=$1 AND ap.estado='credited' FOR UPDATE OF ap`,
      [refundId],
    );
    if (!a || Number(a.puntos) === 0) return;
    await m.query('SELECT 1 FROM cliente WHERE id_cliente=$1 FOR UPDATE', [a.id_cliente]);
    await m.query(
      `INSERT INTO movimiento_puntos(id_cliente,id_acumulacion,id_devolucion,tipo,puntos) VALUES($1,$2,$3,'refundAdjustment',-$4::bigint)`,
      [a.id_cliente, a.id_acumulacion, refundId, a.puntos],
    );
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
    const [r] = await m.query(
      `SELECT COALESCE((SELECT sum(puntos) FROM movimiento_puntos WHERE id_cliente=$1),0)::text balance,COALESCE((SELECT sum(puntos) FROM acumulacion_puntos WHERE id_cliente=$1 AND estado='pending'),0)::text pending,COALESCE((SELECT sum(puntos) FROM reserva_puntos_canje WHERE id_cliente=$1 AND estado='active'),0)::text reserved`,
      [clientId],
    );
    if (![r.balance, r.pending, r.reserved].every((v) => Number.isSafeInteger(Number(v))))
      throw new ConflictException('Saldo fuera del rango seguro.');
    const balance = Number(r.balance), reservedPoints = Number(r.reserved);
    const available = BigInt(r.balance) - BigInt(r.reserved);
    return { balance, pendingPoints: Number(r.pending), reservedPoints, availablePoints: Number(available > 0n ? available : 0n) };
  }
  private async requireClient(id: string, m: EntityManager = this.db.manager) {
    const [c] = await m.query('SELECT 1 FROM cliente WHERE id_cliente=$1', [
      id,
    ]);
    if (!c) throw new NotFoundException('Cliente no encontrado.');
  }
  async movements(
    clientId: string,
    q: { page: number; limit: number; type?: string; paymentId?: string },
  ) {
    await this.requireClient(clientId);
    const args = [clientId, q.type ?? null, q.paymentId ?? null];
    const from = `FROM movimiento_puntos m LEFT JOIN acumulacion_puntos a ON a.id_acumulacion=m.id_acumulacion LEFT JOIN solicitud_canje sc ON sc.id_canje=m.id_canje WHERE m.id_cliente=$1 AND ($2::text IS NULL OR m.tipo=$2) AND ($3::uuid IS NULL OR a.id_pago=$3)`;
    const [{ total }] = await this.db.query(
      `SELECT count(*)::int total ${from}`,
      args,
    );
    const items = await this.db.query(
      `SELECT m.id_movimiento id,m.tipo type,m.puntos::float8 points,COALESCE(sc.id_pedido,(SELECT o.id_pedido FROM pedido o JOIN liquidacion l ON l.id_cuenta=o.id_cuenta JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE p.id_pago=a.id_pago AND o.modalidad='delivery' LIMIT 1)) AS "orderId",a.id_pago "paymentId",m.id_canje "redemptionId",m.creado_en "createdAt" ${from} ORDER BY m.creado_en DESC,m.id_movimiento DESC LIMIT $4 OFFSET $5`,
      [...args, q.limit, (q.page - 1) * q.limit],
    );
    return { items, total, page: q.page, limit: q.limit };
  }
}
