import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';
// Read builders

// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
import type { EntityManager } from 'typeorm';
export interface CurrentFindConfiguracionPuntosRow {
  version: number;
  enabled: boolean;
  pointsPerDollar: number;
  configuredBy: string;
  createdAt: Date;
}
export interface ConfigureFindRolPermisoRow {
  activo: boolean;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}
export interface ConfigureInsertConfiguracionPuntosRow {
  id: string;
}
export interface RecordConfirmedPaymentFindDetalleLiquidacionRow {
  id_pago: string;
  estado: string;
  id_cuenta: string;
  products: string;
  id_cliente: string;
  modalidad: string;
  registered: boolean;
}
export interface RecordConfirmedPaymentInsertAcumulacionPuntosRow {
  id: string;
}
export interface DeliverOrderUpdateAcumulacionPuntosRow {
  id_acumulacion: string;
  id_cliente: string;
  puntos: string;
  id_pago: string;
}
export interface RefundFindAcumulacionPuntosRow {
  id_acumulacion: string;
  id_cliente: string;
  puntos: string;
}
export interface BalanceFindMovimientoPuntosRow {
  balance: string;
  pending: string;
  reserved: string;
}
export interface RequireClientFindClienteRow {
  '1': string;
}
export interface MovementsFindOperationRow {
  total: number;
}
export interface MovementsFindPedidoRow {
  id: string;
  type: string;
  points: number;
  orderId: boolean;
  paymentId: string;
  redemptionId: string;
  createdAt: Date;
}
export class PointsRepository {
  async currentFindConfiguracionPuntos(
    manager: EntityManager,
  ): Promise<CurrentFindConfiguracionPuntosRow[]> {
    return manager.query<CurrentFindConfiguracionPuntosRow[]>(
      `SELECT version,habilitado AS enabled,tasa_por_dolar AS "pointsPerDollar",configurada_por AS "configuredBy",creada_en AS "createdAt" FROM configuracion_puntos ORDER BY version DESC LIMIT 1`,
      [],
    );
  }
  async configureFindRolPermiso(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<ConfigureFindRolPermisoRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      'points.configure',
    );
    return row ? [row] : [];
  }
  async configureInsertConfiguracionPuntos(
    manager: EntityManager,
    input: { version: number; enabled: boolean; rate: number; userId: string },
  ): Promise<ConfigureInsertConfiguracionPuntosRow[]> {
    return manager.query<ConfigureInsertConfiguracionPuntosRow[]>(
      `INSERT INTO configuracion_puntos(version,habilitado,tasa_por_dolar,configurada_por) VALUES($1,$2,$3,$4) RETURNING id_configuracion id`,
      [input.version, input.enabled, input.rate, input.userId],
    );
  }
  async recordConfirmedPaymentFindDetalleLiquidacion(
    manager: EntityManager,
    input: { paymentId: string },
  ): Promise<RecordConfirmedPaymentFindDetalleLiquidacionRow[]> {
    return manager.query<RecordConfirmedPaymentFindDetalleLiquidacionRow[]>(
      `SELECT p.id_pago,p.estado,l.id_cuenta,(SELECT COALESCE(sum(dl.importe_ctvs),0)::text FROM detalle_liquidacion dl WHERE dl.id_liquidacion=l.id_liquidacion) products,c.id_cliente,c.modalidad,(cl.id_usuario IS NOT NULL) registered FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta LEFT JOIN cliente cl ON cl.id_cliente=c.id_cliente WHERE p.id_pago=$1 FOR UPDATE OF p,c`,
      [input.paymentId],
    );
  }
  async recordConfirmedPaymentFindCliente(
    manager: EntityManager,
    input: { id_cliente: string },
  ): Promise<void> {
    await manager.query(
      'SELECT 1 FROM cliente WHERE id_cliente=$1 FOR UPDATE',
      [input.id_cliente],
    );
  }
  async recordConfirmedPaymentInsertAcumulacionPuntos(
    manager: EntityManager,
    input: {
      paymentId: string;
      id_cliente: string;
      version: number;
      productsCents: string;
      points: string;
      state: 'pending' | 'credited';
    },
  ): Promise<RecordConfirmedPaymentInsertAcumulacionPuntosRow[]> {
    return manager.query<RecordConfirmedPaymentInsertAcumulacionPuntosRow[]>(
      `INSERT INTO acumulacion_puntos(id_pago,id_cliente,id_configuracion,productos_ctvs,puntos,estado,acreditada_en) VALUES($1,$2,(SELECT id_configuracion FROM configuracion_puntos WHERE version=$3),$4,$5,$6,CASE WHEN $6::varchar='credited' THEN clock_timestamp() END) ON CONFLICT(id_pago) DO NOTHING RETURNING id_acumulacion id`,
      [
        input.paymentId,
        input.id_cliente,
        input.version,
        input.productsCents,
        input.points,
        input.state,
      ],
    );
  }
  async recordConfirmedPaymentInsertMovimientoPuntos(
    manager: EntityManager,
    input: { id_cliente: string; id: string; points: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO movimiento_puntos(id_cliente,id_acumulacion,tipo,puntos) VALUES($1,$2,'earn',$3)`,
      [input.id_cliente, input.id, input.points],
    );
  }
  async deliverOrderUpdateAcumulacionPuntos(
    manager: EntityManager,
    input: { orderId: string },
  ): Promise<DeliverOrderUpdateAcumulacionPuntosRow[]> {
    const [rows] = await manager.query<
      [DeliverOrderUpdateAcumulacionPuntosRow[], number]
    >(
      `UPDATE acumulacion_puntos ap SET estado='credited',acreditada_en=clock_timestamp() FROM pago p,liquidacion l,pedido o WHERE ap.id_pago=p.id_pago AND p.id_liquidacion=l.id_liquidacion AND l.id_cuenta=o.id_cuenta AND o.id_pedido=$1 AND ap.estado='pending' RETURNING ap.id_acumulacion,ap.id_cliente,ap.puntos,ap.id_pago`,
      [input.orderId],
    );
    return rows;
  }
  async refundFindAcumulacionPuntos(
    manager: EntityManager,
    input: { refundId: string },
  ): Promise<RefundFindAcumulacionPuntosRow[]> {
    return manager.query<RefundFindAcumulacionPuntosRow[]>(
      `SELECT ap.id_acumulacion,ap.id_cliente,ap.puntos FROM acumulacion_puntos ap JOIN devolucion d ON d.id_pago=ap.id_pago WHERE d.id_devolucion=$1 AND ap.estado='credited' FOR UPDATE OF ap`,
      [input.refundId],
    );
  }
  async refundInsertMovimientoPuntos(
    manager: EntityManager,
    input: {
      id_cliente: string;
      id_acumulacion: string;
      refundId: string;
      puntos: string;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO movimiento_puntos(id_cliente,id_acumulacion,id_devolucion,tipo,puntos) VALUES($1,$2,$3,'refundAdjustment',-$4::bigint)`,
      [input.id_cliente, input.id_acumulacion, input.refundId, input.puntos],
    );
  }
  async balanceFindMovimientoPuntos(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<BalanceFindMovimientoPuntosRow[]> {
    return manager.query<BalanceFindMovimientoPuntosRow[]>(
      `SELECT COALESCE((SELECT sum(puntos) FROM movimiento_puntos WHERE id_cliente=$1),0)::text balance,COALESCE((SELECT sum(puntos) FROM acumulacion_puntos WHERE id_cliente=$1 AND estado='pending'),0)::text pending,COALESCE((SELECT sum(puntos) FROM reserva_puntos_canje WHERE id_cliente=$1 AND estado='active'),0)::text reserved`,
      [input.clientId],
    );
  }
  async requireClientFindCliente(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RequireClientFindClienteRow[]> {
    return manager.query<RequireClientFindClienteRow[]>(
      'SELECT 1 FROM cliente WHERE id_cliente=$1',
      [input.id],
    );
  }
  private async movementsFindOperation(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<MovementsFindOperationRow[]> {
    return manager.query<MovementsFindOperationRow[]>(
      `SELECT count(*)::int total ${fragment0}`,
      parameters,
    );
  }
  private async movementsFindPedido(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<MovementsFindPedidoRow[]> {
    return manager.query<MovementsFindPedidoRow[]>(
      `SELECT m.id_movimiento id,m.tipo type,m.puntos::float8 points,COALESCE(sc.id_pedido,(SELECT o.id_pedido FROM pedido o JOIN liquidacion l ON l.id_cuenta=o.id_cuenta JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE p.id_pago=a.id_pago AND o.modalidad='delivery' LIMIT 1)) AS "orderId",a.id_pago "paymentId",m.id_canje "redemptionId",m.creado_en "createdAt" ${fragment0} ORDER BY m.creado_en DESC,m.id_movimiento DESC LIMIT $4 OFFSET $5`,
      parameters,
    );
  }

  async movements(
    manager: EntityManager,
    clientId: string,
    q: { page: number; limit: number; type?: string; paymentId?: string },
  ) {
    const args = [clientId, q.type ?? null, q.paymentId ?? null];
    const from = `FROM movimiento_puntos m LEFT JOIN acumulacion_puntos a ON a.id_acumulacion=m.id_acumulacion LEFT JOIN solicitud_canje sc ON sc.id_canje=m.id_canje WHERE m.id_cliente=$1 AND ($2::text IS NULL OR m.tipo=$2) AND ($3::uuid IS NULL OR a.id_pago=$3)`;
    const [{ total }] = await this.movementsFindOperation(manager, args, from);
    const items = await this.movementsFindPedido(
      manager,
      [...args, q.limit, (q.page - 1) * q.limit],
      from,
    );
    return { items, total, page: q.page, limit: q.limit };
  }
}
