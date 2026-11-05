import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';
import type {
  AdminCancellationListDto,
  CancellationListDto,
} from '../cancellations.dto.js';
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
export interface StaffFindUsuarioRow {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
}
export interface StaffFindUsuarioNextRow {
  '1': string;
}
export interface CreateFindPedidoRow {
  '1': string;
}
export interface CreateFindPedidoNextRow {
  estado: string;
  modalidad: string;
  id_cuenta: string;
  id_version: string;
  numero: number;
}
export interface CreateFindLiquidacionRow {
  '1': string;
}
export interface CreateFindSolicitudCancelacionRow {
  '1': string;
}
export interface CreateFindLiquidacionNextRow {
  '1': string;
}
export interface CreateInsertSolicitudCancelacionRow {
  id: string;
}
export interface DetailFindSolicitudCancelacionRow {
  id: string;
  orderId: string;
  modality: string;
  operatingDayId: string;
  versionId: string;
  orderStatus: string;
  status: string;
  reason: string;
  createdAt: Date;
  decidedAt: Date;
  rejectionReason: string;
  requestedBy?: string | null;
  decidedBy?: string | null;
  history?: DetailFindHistorialCancelacionRow[];
}
export interface DetailFindHistorialCancelacionRow {
  event: string;
  userId: string;
  guestSessionId: string;
  occurredAt: Date;
}
export interface ListFindOperationRow {
  total: number;
}
export interface ListFindOperationNextRow {
  id: string;
}
export interface DecideFindSolicitudCancelacionRow {
  id_solicitud: string;
  id_pedido: string;
  id_version: string;
  estado_pedido: string;
  solicitada_cliente: boolean;
  estado: string;
  motivo: string;
  actor_usuario: string;
  actor_sesion_cliente: string;
  creada_en: Date;
  decidida_por: string;
  decidida_en: Date;
  motivo_rechazo: string;
  id_cuenta: string;
  modalidad: string;
  current_order: string;
  account_status: string;
  id_pago: string;
  id_liquidacion: string;
  payment_status: string;
  importe_ctvs: string;
  total_ctvs: string;
}
export interface DecideFindVersionPedidoRow {
  id_version: string;
}
export interface DecideFindPagoRow {
  '1': string;
}
export interface DecideInsertDevolucionRow {
  id: string;
}

export class CancellationsRepository {
  async staffFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<StaffFindUsuarioRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      undefined,
    );
    return row ? [row] : [];
  }
  async staffFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string; permission: string },
  ): Promise<StaffFindUsuarioNextRow[]> {
    return (await new AuthorizationRepository().hasPermission(
      manager,
      input.userId,
      input.permission,
    ))
      ? [{ '1': '1' }]
      : [];
  }
  async createFindPedido(
    manager: EntityManager,
    input: { orderId: string; clientId: string },
  ): Promise<CreateFindPedidoRow[]> {
    return manager.query<CreateFindPedidoRow[]>(
      `SELECT 1 FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE o.id_pedido=$1 AND c.id_cliente=$2`,
      [input.orderId, input.clientId],
    );
  }
  async createFindPedidoNext(
    manager: EntityManager,
    input: { orderId: string },
  ): Promise<CreateFindPedidoNextRow[]> {
    return manager.query<CreateFindPedidoNextRow[]>(
      `SELECT o.estado,o.modalidad,o.id_cuenta,v.id_version,v.numero FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 FOR UPDATE OF o,v,c`,
      [input.orderId],
    );
  }
  async createFindLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<CreateFindLiquidacionRow[]> {
    return manager.query<CreateFindLiquidacionRow[]>(
      `SELECT 1 FROM liquidacion l JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado='pendingVerification'`,
      [input.id_cuenta],
    );
  }
  async createFindSolicitudCancelacion(
    manager: EntityManager,
    input: { orderId: string },
  ): Promise<CreateFindSolicitudCancelacionRow[]> {
    return manager.query<CreateFindSolicitudCancelacionRow[]>(
      `SELECT 1 FROM solicitud_cancelacion WHERE id_pedido=$1 AND estado='pending'`,
      [input.orderId],
    );
  }
  async createFindLiquidacionNext(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<CreateFindLiquidacionNextRow[]> {
    return manager.query<CreateFindLiquidacionNextRow[]>(
      `SELECT 1 FROM liquidacion l JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado='confirmed'`,
      [input.id_cuenta],
    );
  }
  async createInsertSolicitudCancelacion(
    manager: EntityManager,
    input: {
      orderId: string;
      id_version: string;
      estado: string;
      reason: string;
      userId: string | null;
      guestSessionId: string | null;
      requestedByClient: boolean;
    },
  ): Promise<CreateInsertSolicitudCancelacionRow[]> {
    return manager.query<CreateInsertSolicitudCancelacionRow[]>(
      `INSERT INTO solicitud_cancelacion(id_pedido,id_version,estado_pedido,motivo,actor_usuario,actor_sesion_cliente,solicitada_cliente) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_solicitud AS id`,
      [
        input.orderId,
        input.id_version,
        input.estado,
        input.reason,
        input.userId,
        input.guestSessionId,
        input.requestedByClient,
      ],
    );
  }
  async createInsertHistorialCancelacion(
    manager: EntityManager,
    input: { id: string; userId: string | null; guestSessionId: string | null },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_cancelacion(id_solicitud,actor_usuario,actor_sesion_cliente,evento) VALUES ($1,$2,$3,'requested')`,
      [input.id, input.userId, input.guestSessionId],
    );
  }
  async detailFindSolicitudCancelacion(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<DetailFindSolicitudCancelacionRow[]> {
    return manager.query<DetailFindSolicitudCancelacionRow[]>(
      `SELECT s.id_solicitud AS id,s.id_pedido AS "orderId",o.modalidad AS modality,o.id_jornada AS "operatingDayId",s.id_version AS "versionId",s.estado_pedido AS "orderStatus",s.estado AS status,s.motivo AS reason,s.creada_en AS "createdAt",s.decidida_en AS "decidedAt",s.motivo_rechazo AS "rejectionReason",s.actor_usuario AS "requestedBy",s.decidida_por AS "decidedBy" FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE s.id_solicitud=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [input.id, input.clientId],
    );
  }
  async detailFindHistorialCancelacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindHistorialCancelacionRow[]> {
    return manager.query<DetailFindHistorialCancelacionRow[]>(
      `SELECT evento AS event,actor_usuario AS "userId",actor_sesion_cliente AS "guestSessionId",ocurrido_en AS "occurredAt" FROM historial_cancelacion WHERE id_solicitud=$1 ORDER BY ocurrido_en,id_historial`,
      [input.id],
    );
  }
  private async listFindOperation(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListFindOperationRow[]> {
    return manager.query<ListFindOperationRow[]>(
      `SELECT count(*)::int AS total ${fragment0}`,
      parameters,
    );
  }
  private async listFindOperationNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListFindOperationNextRow[]> {
    return manager.query<ListFindOperationNextRow[]>(
      `SELECT s.id_solicitud AS id ${fragment0} ORDER BY s.creada_en DESC,s.id_solicitud DESC LIMIT $6 OFFSET $7`,
      parameters,
    );
  }
  async decideFindSolicitudCancelacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCancelacionRow[]> {
    return manager.query<DecideFindSolicitudCancelacionRow[]>(
      `SELECT s.*,o.id_pedido,o.id_cuenta,o.modalidad,o.estado AS current_order,c.estado AS account_status,p.id_pago,p.id_liquidacion,p.estado AS payment_status,p.importe_ctvs,l.total_ctvs FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta LEFT JOIN liquidacion l ON l.id_cuenta=c.id_cuenta LEFT JOIN pago p ON p.id_liquidacion=l.id_liquidacion AND p.estado='confirmed' WHERE s.id_solicitud=$1 FOR UPDATE OF s,o,c`,
      [input.id],
    );
  }
  async decideFindVersionPedido(
    manager: EntityManager,
    input: { id_pedido: string },
  ): Promise<DecideFindVersionPedidoRow[]> {
    return manager.query<DecideFindVersionPedidoRow[]>(
      `SELECT id_version FROM version_pedido WHERE id_pedido=$1 AND estado='current'`,
      [input.id_pedido],
    );
  }
  async decideFindPago(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<DecideFindPagoRow[]> {
    return manager.query<DecideFindPagoRow[]>(
      `SELECT 1 FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado='pendingVerification'`,
      [input.id_cuenta],
    );
  }
  async decideUpdatePedido(
    manager: EntityManager,
    input: { id_pedido: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE pedido SET estado='cancelled' WHERE id_pedido=$1`,
      [input.id_pedido],
    );
  }
  async decideInsertHistorialPedido(
    manager: EntityManager,
    input: {
      id_pedido: string;
      id_version: string;
      userId: string;
      current_order: string;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_tipo,evento,estado_anterior,estado_nuevo,motivo) VALUES ($1,$2,$3,'usuario','order.cancellationApproved',$4,'cancelled','cancelledByRequest')`,
      [input.id_pedido, input.id_version, input.userId, input.current_order],
    );
  }
  async decideLockReservaInventario(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<void> {
    await manager.query(
      `WITH released AS (UPDATE reserva_inventario ri SET estado='released',resuelta_en=clock_timestamp() FROM detalle_pedido d WHERE d.id_detalle=ri.id_detalle AND d.id_version=$1 AND ri.estado='active' RETURNING ri.id_inventario,ri.cantidad) UPDATE inventario_diario i SET cantidad_reservada=i.cantidad_reservada-x.qty FROM (SELECT id_inventario,sum(cantidad)::int qty FROM released GROUP BY id_inventario)x WHERE i.id_inventario=x.id_inventario`,
      [input.id_version],
    );
  }
  async decideUpdateAsignacionConsumo(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE asignacion_consumo SET estado='superseded' WHERE id_detalle IN (SELECT id_detalle FROM detalle_pedido WHERE id_version=$1) AND estado='active'`,
      [input.id_version],
    );
  }
  async decideUpdateLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string; userId: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE liquidacion SET estado='cancelled',anulada_por=$2,anulada_en=clock_timestamp(),motivo_anulacion='cancelledByRequest' WHERE id_cuenta=$1 AND estado='pending'`,
      [input.id_cuenta, input.userId],
    );
  }
  async decideUpdateDetalleLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE detalle_liquidacion SET vigente=false WHERE id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=$1 AND estado='cancelled')`,
      [input.id_cuenta],
    );
  }
  async decideInsertDevolucion(
    manager: EntityManager,
    input: {
      id: string;
      id_pago: string;
      id_pedido: string;
      amount: number;
      userId: string;
    },
  ): Promise<DecideInsertDevolucionRow[]> {
    return manager.query<DecideInsertDevolucionRow[]>(
      `INSERT INTO devolucion(id_solicitud,id_pago,id_pedido,importe_ctvs,autorizada_por) VALUES ($1,$2,$3,$4,$5) RETURNING id_devolucion AS id`,
      [input.id, input.id_pago, input.id_pedido, input.amount, input.userId],
    );
  }
  async decideInsertHistorialDevolucion(
    manager: EntityManager,
    input: { id: string; userId: string; detailJson: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_devolucion(id_devolucion,actor_usuario,evento,detalle) VALUES ($1,$2,'refund.authorized',$3::jsonb)`,
      [input.id, input.userId, input.detailJson],
    );
  }
  async decideUpdateCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,
      [input.id_cuenta],
    );
  }
  async decideUpdateAcumulacionPuntos(
    manager: EntityManager,
    input: { id_pago: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE acumulacion_puntos SET estado='cancelled' WHERE id_pago=$1 AND estado='pending'`,
      [input.id_pago],
    );
  }
  async decideUpdateSolicitudCancelacion(
    manager: EntityManager,
    input: {
      id: string;
      status: string;
      userId: string | null;
      rejectionReason: string | null | undefined;
    },
  ): Promise<void> {
    await manager.query(
      `UPDATE solicitud_cancelacion SET estado=$2,decidida_por=$3,decidida_en=clock_timestamp(),motivo_rechazo=$4 WHERE id_solicitud=$1`,
      [input.id, input.status, input.userId, input.rejectionReason],
    );
  }
  async decideInsertHistorialCancelacion(
    manager: EntityManager,
    input: {
      id: string;
      userId: string | null;
      guestSessionId: string | null;
      decision: 'approve' | 'reject' | 'withdraw';
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_cancelacion(id_solicitud,actor_usuario,actor_sesion_cliente,evento) VALUES ($1,$2,$3,$4)`,
      [input.id, input.userId, input.guestSessionId, input.decision],
    );
  }

  async listCancellationIds(
    manager: EntityManager,
    q: CancellationListDto,
    clientId?: string,
  ) {
    const a = q as AdminCancellationListDto;
    const args = [
      clientId ?? null,
      q.status ?? null,
      q.orderId ?? null,
      a.modality ?? null,
      a.operatingDayId ?? null,
    ];
    const from = `FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE ($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::text IS NULL OR s.estado=$2) AND ($3::uuid IS NULL OR s.id_pedido=$3) AND ($4::text IS NULL OR o.modalidad=$4) AND ($5::uuid IS NULL OR o.id_jornada=$5)`;
    const [{ total }] = await this.listFindOperation(manager, args, from);
    const rows = await this.listFindOperationNext(
      manager,
      [...args, q.limit, (q.page - 1) * q.limit],
      from,
    );

    return { rows, total };
  }
}
