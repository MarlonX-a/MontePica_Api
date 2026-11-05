import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';

import type {
  AccountListDto,
  AdminAccountListDto,
  SettlementListDto,
} from '../settlements.dto.js';

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
export interface AuthorizeFindUsuarioRow {
  activo: boolean;
  revocada_en: Date | null;
  valid: boolean;
}
export interface AuthorizeFindUsuarioNextRow {
  '1': string;
}
export interface AccountFindCuentaConsumoRow {
  id: string;
  modality: string;
  clientId: string;
  participantId: string;
  operatingDayId: string;
  visitId: string;
  status: string;
  createdAt: Date;
  closedAt: Date;
  items?: AccountFindAsignacionConsumoRow[];
  totalCents?: number;
  productsCents?: number;
  shippingCents?: number;
  paidCents?: number;
  pendingCents?: number;
  refundPendingCents?: number;
  refundedCents?: number;
  currency?: string;
  pendingSettlement?: AccountFindLiquidacionNextRow | null;
}
export interface AccountFindAsignacionConsumoRow {
  id: string;
  orderId: string;
  orderStatus: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}
export interface AccountFindDetalleLiquidacionRow {
  paid: number;
  resolved: number;
}
export interface AccountFindLiquidacionRow {
  fee: number;
  paid: number;
}
export interface AccountFindDevolucionRow {
  pending: number;
  completed: number;
}
export interface AccountFindLiquidacionNextRow {
  id: string;
  status: string;
  totalCents: number;
}
export interface SettlementFindPagoRow {
  id: string;
  accountId: string;
  cashRegisterId: string;
  status: string;
  productsCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  createdBy: string;
  createdAt: Date;
  cancelledBy: string;
  cancelledAt: Date;
  cancellationReason: string;
  settledAt: Date;
  resolution: string;
  paymentId: string | null;
  items?: SettlementFindDetalleLiquidacionRow[];
}
export interface SettlementFindDetalleLiquidacionRow {
  id: string;
  assignmentId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  active: boolean;
}
export interface AccountsFindOperationRow {
  total: number;
}
export interface AccountsFindOperationNextRow {
  id: string;
}
export interface SettlementsFindLiquidacionRow {
  total: number;
}
export interface SettlementsFindLiquidacionNextRow {
  id: string;
}
export interface CreateFindJornadaOperativaRow {
  id: string;
  cash: string;
}
export interface CreateFindCuentaConsumoRow {
  estado: string;
  modalidad: string;
}
export interface CreateFindLiquidacionRow {
  '1': string;
}
export interface CreateFindSolicitudCancelacionRow {
  '1': string;
}
export interface CreateFindPedidoRow {
  '1': string;
}
export interface CreateFindAsignacionConsumoRow {
  id: string;
  quantity: number;
  price: number;
}
export interface CreateInsertLiquidacionRow {
  id: string;
}
export interface CancelFindLiquidacionRow {
  id_cuenta: string;
}
export interface CancelFindCuentaConsumoRow {
  modalidad: string;
}
export interface CancelFindLiquidacionNextRow {
  estado: string;
}
export interface CancelFindPagoRow {
  '1': string;
}
export class SettlementsRepository {
  async authorizeFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizeFindUsuarioRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      undefined,
    );
    return row ? [row] : [];
  }
  async authorizeFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string },
  ): Promise<AuthorizeFindUsuarioNextRow[]> {
    return (await new AuthorizationRepository().hasPermission(
      manager,
      input.userId,
      'settlements.manage',
    ))
      ? [{ '1': '1' }]
      : [];
  }
  async accountFindCuentaConsumo(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<AccountFindCuentaConsumoRow[]> {
    return manager.query<AccountFindCuentaConsumoRow[]>(
      `SELECT c.id_cuenta AS id,c.modalidad AS modality,c.id_cliente AS "clientId",c.id_participante AS "participantId",c.id_jornada AS "operatingDayId",p.id_visita AS "visitId",c.estado AS status,c.creada_en AS "createdAt",c.cerrada_en AS "closedAt" FROM cuenta_consumo c LEFT JOIN participante p ON p.id_participante=c.id_participante WHERE c.id_cuenta=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [input.id, input.clientId],
    );
  }
  async accountFindAsignacionConsumo(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindAsignacionConsumoRow[]> {
    return manager.query<AccountFindAsignacionConsumoRow[]>(
      `SELECT a.id_asignacion AS id,o.id_pedido AS "orderId",o.estado AS "orderStatus",d.id_producto AS "productId",p.nombre AS "productName",a.cantidad AS quantity,d.precio_unitario_ctvs AS "unitPriceCents",(a.cantidad::bigint*d.precio_unitario_ctvs)::float8 AS "subtotalCents" FROM asignacion_consumo a JOIN detalle_pedido d ON d.id_detalle=a.id_detalle JOIN producto p ON p.id_producto=d.id_producto JOIN version_pedido v ON v.id_version=d.id_version JOIN pedido o ON o.id_pedido=v.id_pedido WHERE a.id_cuenta=$1 AND a.estado='active' ORDER BY o.enviado_en,o.id_pedido,d.id_producto`,
      [input.id],
    );
  }
  async accountFindDetalleLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindDetalleLiquidacionRow[]> {
    return manager.query<AccountFindDetalleLiquidacionRow[]>(
      `SELECT COALESCE(sum(CASE WHEN l.resolucion IN ('cash','transfer') THEN d.importe_ctvs ELSE 0 END),0)::float8 AS paid,COALESCE(sum(d.importe_ctvs),0)::float8 AS resolved FROM detalle_liquidacion d JOIN liquidacion l ON l.id_liquidacion=d.id_liquidacion WHERE l.id_cuenta=$1 AND l.estado='settled' AND d.vigente`,
      [input.id],
    );
  }
  async accountFindLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindLiquidacionRow[]> {
    return manager.query<AccountFindLiquidacionRow[]>(
      `SELECT COALESCE(sum(envio_ctvs),0)::float8 AS fee,COALESCE(sum(CASE WHEN estado='settled' THEN envio_ctvs ELSE 0 END),0)::float8 AS paid FROM liquidacion WHERE id_cuenta=$1 AND estado<>'cancelled'`,
      [input.id],
    );
  }
  async accountFindDevolucion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindDevolucionRow[]> {
    return manager.query<AccountFindDevolucionRow[]>(
      `SELECT COALESCE(sum(d.importe_ctvs) FILTER (WHERE d.estado='pending'),0)::float8 AS pending,COALESCE(sum(d.importe_ctvs) FILTER (WHERE d.estado='completed'),0)::float8 AS completed FROM devolucion d JOIN pedido o ON o.id_pedido=d.id_pedido WHERE o.id_cuenta=$1`,
      [input.id],
    );
  }
  async accountFindLiquidacionNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindLiquidacionNextRow[]> {
    return manager.query<AccountFindLiquidacionNextRow[]>(
      `SELECT id_liquidacion AS id,estado AS status,total_ctvs::float8 AS "totalCents" FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,
      [input.id],
    );
  }
  async settlementFindPago(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<SettlementFindPagoRow[]> {
    return manager.query<SettlementFindPagoRow[]>(
      `SELECT l.id_liquidacion AS id,l.id_cuenta AS "accountId",l.id_caja AS "cashRegisterId",l.estado AS status,l.productos_ctvs::float8 AS "productsCents",l.envio_ctvs::float8 AS "shippingCents",l.total_ctvs::float8 AS "totalCents",'USD' AS currency,l.creada_por AS "createdBy",l.creada_en AS "createdAt",l.anulada_por AS "cancelledBy",l.anulada_en AS "cancelledAt",l.motivo_anulacion AS "cancellationReason",l.cerrada_en AS "settledAt",l.resolucion AS resolution,(SELECT id_pago FROM pago WHERE id_liquidacion=l.id_liquidacion AND estado='confirmed') AS "paymentId" FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE l.id_liquidacion=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [input.id, input.clientId],
    );
  }
  async settlementFindDetalleLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<SettlementFindDetalleLiquidacionRow[]> {
    return manager.query<SettlementFindDetalleLiquidacionRow[]>(
      `SELECT d.id_detalle_liquidacion AS id,d.id_asignacion AS "assignmentId",dp.id_producto AS "productId",p.nombre AS "productName",d.cantidad_snapshot AS quantity,d.precio_snapshot_ctvs AS "unitPriceCents",d.importe_ctvs::float8 AS "subtotalCents",d.vigente AS active FROM detalle_liquidacion d JOIN asignacion_consumo a ON a.id_asignacion=d.id_asignacion JOIN detalle_pedido dp ON dp.id_detalle=a.id_detalle JOIN producto p ON p.id_producto=dp.id_producto WHERE d.id_liquidacion=$1 ORDER BY d.id_detalle_liquidacion`,
      [input.id],
    );
  }
  private async accountsFindOperation(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<AccountsFindOperationRow[]> {
    return manager.query<AccountsFindOperationRow[]>(
      `SELECT count(*)::int AS total ${fragment0}`,
      parameters,
    );
  }
  private async accountsFindOperationNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<AccountsFindOperationNextRow[]> {
    return manager.query<AccountsFindOperationNextRow[]>(
      `SELECT c.id_cuenta AS id ${fragment0} ORDER BY c.creada_en DESC,c.id_cuenta DESC LIMIT $6 OFFSET $7`,
      parameters,
    );
  }
  private async settlementsFindLiquidacion(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<SettlementsFindLiquidacionRow[]> {
    return manager.query<SettlementsFindLiquidacionRow[]>(
      `SELECT count(*)::int AS total FROM liquidacion ${fragment0}`,
      parameters,
    );
  }
  private async settlementsFindLiquidacionNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<SettlementsFindLiquidacionNextRow[]> {
    return manager.query<SettlementsFindLiquidacionNextRow[]>(
      `SELECT id_liquidacion AS id FROM liquidacion ${fragment0} ORDER BY creada_en DESC,id_liquidacion DESC LIMIT $4 OFFSET $5`,
      parameters,
    );
  }
  async createFindJornadaOperativa(
    manager: EntityManager,
    input: { zone: string },
  ): Promise<CreateFindJornadaOperativaRow[]> {
    return manager.query<CreateFindJornadaOperativaRow[]>(
      `SELECT j.id_jornada AS id,c.id_caja AS cash FROM jornada_operativa j JOIN caja c ON c.id_jornada=j.id_jornada WHERE j.fecha_operativa=timezone($1,clock_timestamp())::date AND j.estado='open' AND c.estado='open' FOR UPDATE OF j,c`,
      [input.zone],
    );
  }
  async createFindCuentaConsumo(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindCuentaConsumoRow[]> {
    return manager.query<CreateFindCuentaConsumoRow[]>(
      'SELECT estado,modalidad FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',
      [input.accountId],
    );
  }
  async createFindLiquidacion(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindLiquidacionRow[]> {
    return manager.query<CreateFindLiquidacionRow[]>(
      `SELECT 1 FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,
      [input.accountId],
    );
  }
  async createFindSolicitudCancelacion(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindSolicitudCancelacionRow[]> {
    return manager.query<CreateFindSolicitudCancelacionRow[]>(
      `SELECT 1 FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido WHERE o.id_cuenta=$1 AND s.estado='pending' LIMIT 1`,
      [input.accountId],
    );
  }
  async createFindPedido(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindPedidoRow[]> {
    return manager.query<CreateFindPedidoRow[]>(
      `SELECT 1 FROM pedido WHERE id_cuenta=$1 AND estado NOT IN ('delivered','cancelled') LIMIT 1`,
      [input.accountId],
    );
  }
  async createFindAsignacionConsumo(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindAsignacionConsumoRow[]> {
    return manager.query<CreateFindAsignacionConsumoRow[]>(
      `SELECT a.id_asignacion AS id,a.cantidad AS quantity,d.precio_unitario_ctvs AS price FROM asignacion_consumo a JOIN detalle_pedido d ON d.id_detalle=a.id_detalle WHERE a.id_cuenta=$1 AND a.estado='active' ORDER BY a.id_asignacion FOR UPDATE OF a`,
      [input.accountId],
    );
  }
  async createInsertLiquidacion(
    manager: EntityManager,
    input: { accountId: string; cash: string; total: number; userId: string },
  ): Promise<CreateInsertLiquidacionRow[]> {
    return manager.query<CreateInsertLiquidacionRow[]>(
      `INSERT INTO liquidacion(id_cuenta,id_caja,productos_ctvs,total_ctvs,creada_por) VALUES ($1,$2,$3,$3,$4) RETURNING id_liquidacion AS id`,
      [input.accountId, input.cash, input.total, input.userId],
    );
  }
  async createInsertDetalleLiquidacion(
    manager: EntityManager,
    input: {
      id: string;
      id2: string;
      quantity: number;
      price: number;
      quantity5: number;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO detalle_liquidacion(id_liquidacion,id_asignacion,cantidad_snapshot,precio_snapshot_ctvs,importe_ctvs) VALUES ($1,$2,$3,$4,$5)`,
      [input.id, input.id2, input.quantity, input.price, input.quantity5],
    );
  }
  async cancelFindLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CancelFindLiquidacionRow[]> {
    return manager.query<CancelFindLiquidacionRow[]>(
      'SELECT id_cuenta FROM liquidacion WHERE id_liquidacion=$1',
      [input.id],
    );
  }
  async cancelFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<CancelFindCuentaConsumoRow[]> {
    return manager.query<CancelFindCuentaConsumoRow[]>(
      'SELECT modalidad FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',
      [input.id_cuenta],
    );
  }
  async cancelFindLiquidacionNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CancelFindLiquidacionNextRow[]> {
    return manager.query<CancelFindLiquidacionNextRow[]>(
      'SELECT estado FROM liquidacion WHERE id_liquidacion=$1 FOR UPDATE',
      [input.id],
    );
  }
  async cancelFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CancelFindPagoRow[]> {
    return manager.query<CancelFindPagoRow[]>(
      `SELECT 1 FROM pago WHERE id_liquidacion=$1 AND metodo='transfer' AND estado='pendingVerification'`,
      [input.id],
    );
  }
  async cancelUpdateLiquidacion(
    manager: EntityManager,
    input: { id: string; userId: string; reason: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE liquidacion SET estado='cancelled',anulada_por=$2,anulada_en=clock_timestamp(),motivo_anulacion=$3 WHERE id_liquidacion=$1`,
      [input.id, input.userId, input.reason],
    );
  }
  async cancelUpdateDetalleLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      'UPDATE detalle_liquidacion SET vigente=false WHERE id_liquidacion=$1',
      [input.id],
    );
  }

  async listAccountIds(
    manager: EntityManager,
    query: AccountListDto,
    clientId?: string,
  ) {
    const admin = query as AdminAccountListDto;
    const args = [
      clientId ?? null,
      query.status ?? null,
      admin.operatingDayId ?? null,
      admin.visitId ?? null,
      query.modality ?? null,
    ];
    const from = `FROM cuenta_consumo c LEFT JOIN participante p ON p.id_participante=c.id_participante WHERE ($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::text IS NULL OR c.estado=$2) AND ($3::uuid IS NULL OR c.id_jornada=$3) AND ($4::uuid IS NULL OR p.id_visita=$4) AND ($5::text IS NULL OR c.modalidad=$5)`;
    const [{ total }] = await this.accountsFindOperation(manager, args, from);
    const rows: Array<{ id: string }> = await this.accountsFindOperationNext(
      manager,
      [...args, query.limit, (query.page - 1) * query.limit],
      from,
    );

    return { rows, total };
  }

  async listSettlementIds(manager: EntityManager, query: SettlementListDto) {
    const args = [
      query.status ?? null,
      query.accountId ?? null,
      query.cashRegisterId ?? null,
    ];
    const where = `WHERE ($1::text IS NULL OR estado=$1) AND ($2::uuid IS NULL OR id_cuenta=$2) AND ($3::uuid IS NULL OR id_caja=$3)`;
    const [{ total }] = await this.settlementsFindLiquidacion(
      manager,
      args,
      where,
    );
    const rows: Array<{ id: string }> =
      await this.settlementsFindLiquidacionNext(
        manager,
        [...args, query.limit, (query.page - 1) * query.limit],
        where,
      );

    return { rows, total };
  }
}
