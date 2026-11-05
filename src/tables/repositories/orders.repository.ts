import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';

import type { AdminOrderQueryDto, OrderQueryDto } from '../orders.dto.js';

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
export interface EditFindPedidoRow {
  id_visita: string;
}
export interface EditFindPedidoNextRow {
  estado: string;
  id_cuenta: string;
  id_jornada: string;
  id_version: string;
  numero: number;
  editable: boolean;
}
export interface EditFindLiquidacionRow {
  '1': string;
}
export interface EditFindProductoRow {
  id: string;
  price: number;
  tracks: boolean;
}
export interface EditFindDetallePedidoRow {
  id: string;
  price: number;
  tracks: boolean;
}
export interface EditFindReservaInventarioRow {
  id: string;
  inventory: string;
  quantity: number;
}
export interface EditFindInventarioDiarioRow {
  id: string;
  product: string;
  available: number;
}
export interface EditInsertVersionPedidoRow {
  id: string;
}
export interface EditInsertDetallePedidoRow {
  id: string;
}
export interface TransitionFindUsuarioRow {
  '1': string;
}
export interface TransitionFindUsuarioNextRow {
  '1': string;
}
export interface TransitionFindPedidoNextRow {
  estado: string;
  modalidad: string;
  origen: string;
  id_jornada: string;
  id_cuenta: string;
  id_version: string;
  numero: number;
}
export interface TransitionFindCuentaConsumoRow {
  estado: string;
}
export interface TransitionFindJornadaOperativaRow {
  '1': string;
}
export interface TransitionFindLiquidacionRow {
  '1': string;
}
export interface TransitionFindPagoRow {
  '1': string;
}
export interface TransitionFindSolicitudCancelacionRow {
  '1': string;
}
export interface TransitionFindReservaInventarioRow {
  id: string;
  inventory: string;
  quantity: number;
  physical: number;
}
export interface CreateFindParticipanteRow {
  '1': string;
}
export interface CreateFindParticipanteNextRow {
  id: string;
  day: string;
}
export interface CreateFindCajaRow {
  estado: string;
}
export interface CreateFindInventarioDiarioRow {
  id: string;
  product: string;
  available: number;
}
export interface CreateInsertPedidoRow {
  id: string;
}
export interface CreateInsertVersionPedidoRow {
  id: string;
}
export interface CreateDeliveryFindSolicitudDomicilioRow {
  '1': string;
}
export interface CreateDeliveryFindJornadaOperativaRow {
  id: string;
  cash: string;
}
export interface CreateDeliveryFindSolicitudDomicilioNextRow {
  id_solicitud: string;
  id_cliente: string;
  id_jornada: string;
  id_configuracion: string;
  destinatario: string;
  telefono: string;
  direccion: string;
  referencias: string;
  latitud: number;
  longitud: number;
  tarifa_ctvs: string;
  estado: string;
  creada_en: Date;
  decidida_en: Date;
  decidida_por: string;
  motivo_rechazo: string;
  cancelada_en: Date;
  version: number;
}
export interface CreateDeliveryFindConfigDomicilioRow {
  id_configuracion: string;
  version: number;
  habilitado: boolean;
  cobertura: string;
  tarifa_ctvs: string;
  configurada_por: string;
  creada_en: Date;
  comprobante_plazo_seg: number;
}
export interface CreateDeliveryFindEntregaDomicilioRow {
  '1': string;
}
export interface CreateDeliveryInsertCuentaConsumoRow {
  id: string;
  day: string;
}
export interface CreateDeliveryInsertPedidoRow {
  id: string;
}
export interface CreateDeliveryInsertLiquidacionRow {
  id: string;
}
export interface DetailFindPedidoRow {
  id: string;
  modality: string;
  visitId: string;
  operatingDayId: string;
  accountId: string;
  status: string;
  submittedAt: Date;
  editableUntil: Date;
  canEdit: boolean;
  versionId: string;
  version: number;
  notes: string;
  totalCents: number;
  currency: string;
  delivery?: DetailFindEntregaDomicilioRow | null;
  productsCents?: number;
  shippingCents?: number;
  settlement?: DetailFindLiquidacionRow | null;
  items?: DetailFindDetallePedidoRow[];
  history?: DetailFindHistorialPedidoRow[];
}
export interface DetailFindEntregaDomicilioRow {
  receiptSubmissionDeadline: Date;
  dispatchedAt: Date;
  dispatchedBy: string;
  deliveredAt: Date;
  deliveredBy: string;
  requestId: string;
  recipientName: string;
  phone: string;
  address: string;
  references: string;
  latitude: number;
  longitude: number;
  configurationVersion: number;
  shippingCents: number;
}
export interface DetailFindLiquidacionRow {
  id: string;
  status: string;
}
export interface DetailFindDetallePedidoRow {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  tracksInventory: boolean;
  notes: string;
}
export interface DetailFindHistorialPedidoRow {
  actorType: string;
  userId: string;
  guestSessionId: string;
  event: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  occurredAt: Date;
}
export interface HistoryFindVersionPedidoRow {
  id: string;
  version: number;
  status: string;
  totalCents: number;
  notes: string;
  createdAt: Date;
  items?: HistoryFindDetallePedidoRow[];
}
export interface HistoryFindDetallePedidoRow {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  tracksInventory: boolean;
  notes: string;
}
export interface ListFindOperationRow {
  total: number;
}
export interface ListFindOperationNextRow {
  id: string;
}
export class OrdersRepository {
  async editFindPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<EditFindPedidoRow[]> {
    return manager.query<EditFindPedidoRow[]>(
      'SELECT id_visita FROM pedido WHERE id_pedido=$1',
      [input.id],
    );
  }
  async editFindPedidoNext(
    manager: EntityManager,
    input: { id: string; clientId: string },
  ): Promise<EditFindPedidoNextRow[]> {
    return manager.query<EditFindPedidoNextRow[]>(
      `SELECT o.estado,o.id_cuenta,o.id_jornada,v.id_version,v.numero,(o.editable_hasta>clock_timestamp()) AS editable FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta JOIN participante p ON p.id_participante=c.id_participante WHERE o.id_pedido=$1 AND c.id_cliente=$2 AND c.estado='open' AND p.estado='approved' FOR UPDATE OF o,v,c,p`,
      [input.id, input.clientId],
    );
  }
  async editFindLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<EditFindLiquidacionRow[]> {
    return manager.query<EditFindLiquidacionRow[]>(
      `SELECT 1 FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,
      [input.id_cuenta],
    );
  }
  async editFindProducto(
    manager: EntityManager,
    input: { ids: string[] },
  ): Promise<EditFindProductoRow[]> {
    return manager.query<EditFindProductoRow[]>(
      `SELECT p.id_producto AS id,p.precio_ctvs AS price,p.controla_inventario AS tracks FROM producto p JOIN categoria c ON c.id_categoria=p.id_categoria WHERE p.id_producto=ANY($1::uuid[]) AND p.activo AND p.visible_menu AND c.activa ORDER BY p.id_producto FOR SHARE OF p,c`,
      [input.ids],
    );
  }
  async editFindDetallePedido(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<EditFindDetallePedidoRow[]> {
    return manager.query<EditFindDetallePedidoRow[]>(
      'SELECT id_producto AS id,precio_unitario_ctvs AS price,controla_stock_snapshot AS tracks FROM detalle_pedido WHERE id_version=$1',
      [input.id_version],
    );
  }
  async editFindReservaInventario(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<EditFindReservaInventarioRow[]> {
    return manager.query<EditFindReservaInventarioRow[]>(
      `SELECT r.id_reserva AS id,r.id_inventario AS inventory,r.cantidad AS quantity FROM reserva_inventario r JOIN detalle_pedido d ON d.id_detalle=r.id_detalle WHERE d.id_version=$1 AND r.estado='active' ORDER BY r.id_inventario FOR UPDATE OF r`,
      [input.id_version],
    );
  }
  async editFindInventarioDiario(
    manager: EntityManager,
    input: {
      id_jornada: string;
      ids: string[];
      reservedInventoryIds: string[];
    },
  ): Promise<EditFindInventarioDiarioRow[]> {
    return manager.query<EditFindInventarioDiarioRow[]>(
      `SELECT id_inventario AS id,id_producto AS product,cantidad_fisica-cantidad_reservada AS available FROM inventario_diario WHERE id_jornada=$1 AND (id_producto=ANY($2::uuid[]) OR id_inventario=ANY($3::uuid[])) ORDER BY id_producto FOR UPDATE`,
      [input.id_jornada, input.ids, input.reservedInventoryIds],
    );
  }
  async editUpdateInventarioDiario(
    manager: EntityManager,
    input: { inventory: string; quantity: number },
  ): Promise<void> {
    await manager.query(
      'UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-$2 WHERE id_inventario=$1',
      [input.inventory, input.quantity],
    );
  }
  async editUpdateReservaInventario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE reserva_inventario SET estado='released',resuelta_en=clock_timestamp() WHERE id_reserva=$1`,
      [input.id],
    );
  }
  async editUpdateAsignacionConsumo(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE asignacion_consumo SET estado='superseded' WHERE id_detalle IN (SELECT id_detalle FROM detalle_pedido WHERE id_version=$1) AND estado='active'`,
      [input.id_version],
    );
  }
  async editUpdateVersionPedido(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE version_pedido SET estado='superseded' WHERE id_version=$1`,
      [input.id_version],
    );
  }
  async editInsertVersionPedido(
    manager: EntityManager,
    input: { id: string; numero: number; total: number; notes: string | null },
  ): Promise<EditInsertVersionPedidoRow[]> {
    return manager.query<EditInsertVersionPedidoRow[]>(
      `INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs,observaciones) VALUES ($1,$2,'current',$3,$4) RETURNING id_version AS id`,
      [input.id, input.numero, input.total, input.notes],
    );
  }
  async editInsertDetallePedido(
    manager: EntityManager,
    input: {
      id: string;
      id2: string;
      quantity: number;
      price: number;
      tracks: boolean;
      notes: string | null;
    },
  ): Promise<EditInsertDetallePedidoRow[]> {
    return manager.query<EditInsertDetallePedidoRow[]>(
      `INSERT INTO detalle_pedido(id_version,id_producto,cantidad,precio_unitario_ctvs,controla_stock_snapshot,observaciones) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_detalle AS id`,
      [
        input.id,
        input.id2,
        input.quantity,
        input.price,
        input.tracks,
        input.notes,
      ],
    );
  }
  async editInsertAsignacionConsumo(
    manager: EntityManager,
    input: { id: string; id_cuenta: string; quantity: number },
  ): Promise<void> {
    await manager.query(
      'INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES ($1,$2,$3)',
      [input.id, input.id_cuenta, input.quantity],
    );
  }
  async editUpdateInventarioDiarioNext(
    manager: EntityManager,
    input: { id: string; quantity: number },
  ): Promise<void> {
    await manager.query(
      'UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada+$2 WHERE id_inventario=$1',
      [input.id, input.quantity],
    );
  }
  async editInsertReservaInventario(
    manager: EntityManager,
    input: { id: string; id2: string; quantity: number },
  ): Promise<void> {
    await manager.query(
      'INSERT INTO reserva_inventario(id_detalle,id_inventario,cantidad) VALUES ($1,$2,$3)',
      [input.id, input.id2, input.quantity],
    );
  }
  async editInsertHistorialPedido(
    manager: EntityManager,
    input: {
      id: string;
      versionId: string;
      userId: string | null;
      guestSessionId: string | null;
      actorType: 'sesion_cliente' | 'usuario';
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_sesion_cliente,actor_tipo,evento,estado_anterior,estado_nuevo) VALUES ($1,$2,$3,$4,$5,'order.edited','submitted','submitted')`,
      [
        input.id,
        input.versionId,
        input.userId,
        input.guestSessionId,
        input.actorType,
      ],
    );
  }
  async transitionFindUsuario(
    manager: EntityManager,
    input: { userId: string | undefined; sessionId: string | undefined },
  ): Promise<TransitionFindUsuarioRow[]> {
    return manager.query<TransitionFindUsuarioRow[]>(
      `SELECT 1 FROM usuario u JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 AND u.activo AND s.revocada_en IS NULL AND s.expira_en>clock_timestamp() FOR SHARE OF u,s`,
      [input.userId, input.sessionId],
    );
  }
  async transitionFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string | undefined },
  ): Promise<TransitionFindUsuarioNextRow[]> {
    return (await new AuthorizationRepository().hasPermission(
      manager,
      input.userId,
      'orders.manage',
    ))
      ? [{ '1': '1' }]
      : [];
  }
  async transitionFindPedidoNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindPedidoNextRow[]> {
    return manager.query<TransitionFindPedidoNextRow[]>(
      `SELECT o.estado,o.modalidad,o.origen,o.id_jornada,o.id_cuenta,v.id_version,v.numero FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 FOR UPDATE OF o,v`,
      [input.id],
    );
  }
  async transitionFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<TransitionFindCuentaConsumoRow[]> {
    return manager.query<TransitionFindCuentaConsumoRow[]>(
      'SELECT estado FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',
      [input.id_cuenta],
    );
  }
  async transitionFindJornadaOperativa(
    manager: EntityManager,
    input: { id_jornada: string; zone: string },
  ): Promise<TransitionFindJornadaOperativaRow[]> {
    return manager.query<TransitionFindJornadaOperativaRow[]>(
      `SELECT 1 FROM jornada_operativa WHERE id_jornada=$1 AND estado='open' AND fecha_operativa=timezone($2,clock_timestamp())::date FOR UPDATE`,
      [input.id_jornada, input.zone],
    );
  }
  async transitionFindLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<TransitionFindLiquidacionRow[]> {
    return manager.query<TransitionFindLiquidacionRow[]>(
      `SELECT 1 FROM liquidacion l JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE l.id_cuenta=$1 AND l.estado='settled' AND p.metodo='transfer' AND p.estado='confirmed'`,
      [input.id_cuenta],
    );
  }
  async transitionFindPago(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<TransitionFindPagoRow[]> {
    return manager.query<TransitionFindPagoRow[]>(
      `SELECT 1 FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado IN ('confirmed','pendingVerification')`,
      [input.id_cuenta],
    );
  }
  async transitionUpdateLiquidacion(
    manager: EntityManager,
    input: {
      id_cuenta: string;
      userId: string | undefined;
      reason: string | null;
    },
  ): Promise<void> {
    await manager.query(
      `UPDATE liquidacion SET estado='cancelled',anulada_por=$2,anulada_en=clock_timestamp(),motivo_anulacion=$3 WHERE id_cuenta=$1 AND estado='pending'`,
      [input.id_cuenta, input.userId, input.reason],
    );
  }
  async transitionUpdateDetalleLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE detalle_liquidacion SET vigente=false WHERE id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=$1)`,
      [input.id_cuenta],
    );
  }
  async transitionUpdateCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,
      [input.id_cuenta],
    );
  }
  async transitionFindSolicitudCancelacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindSolicitudCancelacionRow[]> {
    return manager.query<TransitionFindSolicitudCancelacionRow[]>(
      `SELECT 1 FROM solicitud_cancelacion WHERE id_pedido=$1 AND estado='pending'`,
      [input.id],
    );
  }
  async transitionFindReservaInventario(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<TransitionFindReservaInventarioRow[]> {
    return manager.query<TransitionFindReservaInventarioRow[]>(
      `SELECT r.id_reserva AS id,r.id_inventario AS inventory,r.cantidad AS quantity,i.cantidad_fisica AS physical FROM reserva_inventario r JOIN detalle_pedido d ON d.id_detalle=r.id_detalle JOIN inventario_diario i ON i.id_inventario=r.id_inventario WHERE d.id_version=$1 AND r.estado='active' ORDER BY i.id_producto FOR UPDATE OF i,r`,
      [input.id_version],
    );
  }
  async transitionUpdateInventarioDiarioNext(
    manager: EntityManager,
    input: { inventory: string; quantity: number },
  ): Promise<void> {
    await manager.query(
      'UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-$2,cantidad_fisica=cantidad_fisica-$2 WHERE id_inventario=$1',
      [input.inventory, input.quantity],
    );
  }
  async transitionInsertMovimientoInventario(
    manager: EntityManager,
    input: {
      inventory: string;
      id: string;
      userId: string | undefined;
      physicalDelta: number;
      physical: number;
      resultingQuantity: number;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO movimiento_inventario(id_inventario,id_reserva,registrado_por,tipo,delta_fisico,cantidad_anterior,cantidad_posterior,motivo) VALUES ($1,$2,$3,'orderConsumption',$4,$5,$6,'Preparación de pedido')`,
      [
        input.inventory,
        input.id,
        input.userId,
        input.physicalDelta,
        input.physical,
        input.resultingQuantity,
      ],
    );
  }
  async transitionUpdateReservaInventario(
    manager: EntityManager,
    input: { id: string; status: 'released' | 'consumed' },
  ): Promise<void> {
    await manager.query(
      'UPDATE reserva_inventario SET estado=$2,resuelta_en=clock_timestamp() WHERE id_reserva=$1',
      [input.id, input.status],
    );
  }
  async transitionUpdatePedido(
    manager: EntityManager,
    input: { id: string; status: string },
  ): Promise<void> {
    await manager.query('UPDATE pedido SET estado=$2 WHERE id_pedido=$1', [
      input.id,
      input.status,
    ]);
  }
  async transitionUpdateEntregaDomicilio(
    manager: EntityManager,
    parameters: unknown[],
    action: 'dispatch' | 'deliver',
  ): Promise<void> {
    const field = action === 'dispatch' ? 'despachado' : 'entregado';
    await manager.query(
      `UPDATE entrega_domicilio SET ${field}_en=clock_timestamp(),${field}_por=$2 WHERE id_pedido=$1`,
      parameters,
    );
  }
  async transitionInsertHistorialPedido(
    manager: EntityManager,
    input: {
      id: string;
      id_version: string;
      userId: string | null;
      guestSessionId: string | null;
      actorType: 'sesion_cliente' | 'usuario';
      event: string;
      estado: string;
      nextStatus: string;
      reason: string | null;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_sesion_cliente,actor_tipo,evento,estado_anterior,estado_nuevo,motivo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.id,
        input.id_version,
        input.userId,
        input.guestSessionId,
        input.actorType,
        input.event,
        input.estado,
        input.nextStatus,
        input.reason,
      ],
    );
  }
  async createFindParticipante(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<CreateFindParticipanteRow[]> {
    return manager.query<CreateFindParticipanteRow[]>(
      'SELECT 1 FROM participante WHERE id_visita=$1 AND id_cliente=$2',
      [input.visitId, input.clientId],
    );
  }
  async createFindParticipanteNext(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<CreateFindParticipanteNextRow[]> {
    return manager.query<CreateFindParticipanteNextRow[]>(
      `SELECT c.id_cuenta AS id,c.id_jornada AS day FROM participante p JOIN cuenta_consumo c ON c.id_participante=p.id_participante WHERE p.id_visita=$1 AND p.id_cliente=$2 AND p.estado='approved' AND c.estado='open' FOR UPDATE OF p,c`,
      [input.visitId, input.clientId],
    );
  }
  async createFindCaja(
    manager: EntityManager,
    input: { day: string },
  ): Promise<CreateFindCajaRow[]> {
    return manager.query<CreateFindCajaRow[]>(
      `SELECT estado FROM caja WHERE id_jornada=$1`,
      [input.day],
    );
  }
  async createFindInventarioDiario(
    manager: EntityManager,
    input: { day: string; ids: string[] },
  ): Promise<CreateFindInventarioDiarioRow[]> {
    return manager.query<CreateFindInventarioDiarioRow[]>(
      `SELECT id_inventario AS id,id_producto AS product,cantidad_fisica-cantidad_reservada AS available FROM inventario_diario WHERE id_jornada=$1 AND id_producto=ANY($2::uuid[]) ORDER BY id_producto FOR UPDATE`,
      [input.day, input.ids],
    );
  }
  async createInsertPedido(
    manager: EntityManager,
    input: {
      day: string;
      visitId: string;
      id: string;
      userId: string | null;
      guestSessionId: string | null;
    },
  ): Promise<CreateInsertPedidoRow[]> {
    return manager.query<CreateInsertPedidoRow[]>(
      `INSERT INTO pedido(id_jornada,id_visita,id_cuenta,actor_usuario,actor_sesion_cliente,editable_hasta) SELECT $1,$2,$3,$4,$5,clock_timestamp()+make_interval(secs => edicion_local_seg) FROM configuracion_operativa WHERE id_configuracion=1 RETURNING id_pedido AS id`,
      [input.day, input.visitId, input.id, input.userId, input.guestSessionId],
    );
  }
  async createInsertVersionPedido(
    manager: EntityManager,
    input: { id: string; total: number; notes: string | null },
  ): Promise<CreateInsertVersionPedidoRow[]> {
    return manager.query<CreateInsertVersionPedidoRow[]>(
      `INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs,observaciones) VALUES ($1,1,'current',$2,$3) RETURNING id_version AS id`,
      [input.id, input.total, input.notes],
    );
  }
  async createInsertAsignacionConsumo(
    manager: EntityManager,
    input: { id: string; id2: string; quantity: number },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES ($1,$2,$3)`,
      [input.id, input.id2, input.quantity],
    );
  }
  async createInsertHistorialPedido(
    manager: EntityManager,
    input: {
      id: string;
      versionId: string;
      userId: string | null;
      guestSessionId: string | null;
      actorType: 'sesion_cliente' | 'usuario';
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_sesion_cliente,actor_tipo,evento,estado_nuevo) VALUES ($1,$2,$3,$4,$5,'order.submitted','submitted')`,
      [
        input.id,
        input.versionId,
        input.userId,
        input.guestSessionId,
        input.actorType,
      ],
    );
  }
  async createDeliveryFindSolicitudDomicilio(
    manager: EntityManager,
    input: { requestId: string; clientId: string },
  ): Promise<CreateDeliveryFindSolicitudDomicilioRow[]> {
    return manager.query<CreateDeliveryFindSolicitudDomicilioRow[]>(
      'SELECT 1 FROM solicitud_domicilio WHERE id_solicitud=$1 AND id_cliente=$2',
      [input.requestId, input.clientId],
    );
  }
  async createDeliveryFindJornadaOperativa(
    manager: EntityManager,
    input: { zone: string },
  ): Promise<CreateDeliveryFindJornadaOperativaRow[]> {
    return manager.query<CreateDeliveryFindJornadaOperativaRow[]>(
      `SELECT j.id_jornada AS id,c.id_caja AS cash FROM jornada_operativa j JOIN caja c ON c.id_jornada=j.id_jornada WHERE j.estado='open' AND c.estado='open' AND j.fecha_operativa=timezone($1,clock_timestamp())::date FOR UPDATE OF j,c`,
      [input.zone],
    );
  }
  async createDeliveryFindSolicitudDomicilioNext(
    manager: EntityManager,
    input: { requestId: string },
  ): Promise<CreateDeliveryFindSolicitudDomicilioNextRow[]> {
    return manager.query<CreateDeliveryFindSolicitudDomicilioNextRow[]>(
      `SELECT s.*,cfg.version FROM solicitud_domicilio s JOIN config_domicilio cfg ON cfg.id_configuracion=s.id_configuracion WHERE s.id_solicitud=$1 FOR UPDATE OF s`,
      [input.requestId],
    );
  }
  async createDeliveryFindConfigDomicilio(
    manager: EntityManager,
  ): Promise<CreateDeliveryFindConfigDomicilioRow[]> {
    return manager.query<CreateDeliveryFindConfigDomicilioRow[]>(
      'SELECT * FROM config_domicilio ORDER BY version DESC LIMIT 1',
      [],
    );
  }
  async createDeliveryFindEntregaDomicilio(
    manager: EntityManager,
    input: { requestId: string },
  ): Promise<CreateDeliveryFindEntregaDomicilioRow[]> {
    return manager.query<CreateDeliveryFindEntregaDomicilioRow[]>(
      'SELECT 1 FROM entrega_domicilio WHERE id_solicitud=$1',
      [input.requestId],
    );
  }
  async createDeliveryInsertCuentaConsumo(
    manager: EntityManager,
    input: { clientId: string; id: string },
  ): Promise<CreateDeliveryInsertCuentaConsumoRow[]> {
    return manager.query<CreateDeliveryInsertCuentaConsumoRow[]>(
      `INSERT INTO cuenta_consumo(id_cliente,id_jornada,modalidad) VALUES ($1,$2,'delivery') RETURNING id_cuenta AS id,id_jornada AS day`,
      [input.clientId, input.id],
    );
  }
  async createDeliveryInsertPedido(
    manager: EntityManager,
    input: { id: string; id2: string; userId: string | undefined },
  ): Promise<CreateDeliveryInsertPedidoRow[]> {
    return manager.query<CreateDeliveryInsertPedidoRow[]>(
      `INSERT INTO pedido(id_jornada,id_cuenta,actor_usuario,modalidad) VALUES ($1,$2,$3,'delivery') RETURNING id_pedido AS id`,
      [input.id, input.id2, input.userId],
    );
  }
  async createDeliveryInsertEntregaDomicilio(
    manager: EntityManager,
    input: {
      id: string;
      requestId: string;
      version: number;
      comprobante_plazo_seg: number;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO entrega_domicilio(id_pedido,id_solicitud,destinatario,telefono,direccion,referencias,latitud,longitud,version_configuracion,tarifa_ctvs,comprobante_hasta) SELECT $1,id_solicitud,destinatario,telefono,direccion,referencias,latitud,longitud,$3,tarifa_ctvs,clock_timestamp()+make_interval(secs => $4) FROM solicitud_domicilio WHERE id_solicitud=$2`,
      [input.id, input.requestId, input.version, input.comprobante_plazo_seg],
    );
  }
  async createDeliveryInsertLiquidacion(
    manager: EntityManager,
    input: {
      id: string;
      cash: string;
      total: number;
      shipping: number;
      total5: number;
      userId: string | undefined;
    },
  ): Promise<CreateDeliveryInsertLiquidacionRow[]> {
    return manager.query<CreateDeliveryInsertLiquidacionRow[]>(
      `INSERT INTO liquidacion(id_cuenta,id_caja,productos_ctvs,envio_ctvs,total_ctvs,creada_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_liquidacion AS id`,
      [
        input.id,
        input.cash,
        input.total,
        input.shipping,
        input.total5,
        input.userId,
      ],
    );
  }
  async createDeliveryInsertDetalleLiquidacion(
    manager: EntityManager,
    input: { id: string; id2: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO detalle_liquidacion(id_liquidacion,id_asignacion,cantidad_snapshot,precio_snapshot_ctvs,importe_ctvs) SELECT $1,a.id_asignacion,a.cantidad,d.precio_unitario_ctvs,a.cantidad::bigint*d.precio_unitario_ctvs FROM asignacion_consumo a JOIN detalle_pedido d ON d.id_detalle=a.id_detalle WHERE a.id_cuenta=$2`,
      [input.id, input.id2],
    );
  }
  async detailFindPedido(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<DetailFindPedidoRow[]> {
    return manager.query<DetailFindPedidoRow[]>(
      `SELECT o.id_pedido AS id,o.modalidad AS modality,o.id_visita AS "visitId",o.id_jornada AS "operatingDayId",o.id_cuenta AS "accountId",o.estado AS status,o.enviado_en AS "submittedAt",o.editable_hasta AS "editableUntil",COALESCE(o.estado='submitted' AND o.editable_hasta>clock_timestamp() AND c.estado='open' AND p.estado='approved' AND vm.estado='open' AND t.activa AND j.estado='open' AND j.fecha_operativa=timezone(cfg.zona_horaria,clock_timestamp())::date,false) AS "canEdit",v.id_version AS "versionId",v.numero AS version,v.observaciones AS notes,v.total_productos_ctvs::float8 AS "totalCents",'USD' AS currency FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta LEFT JOIN participante p ON p.id_participante=c.id_participante LEFT JOIN visita_mesa vm ON vm.id_visita=o.id_visita LEFT JOIN mesa t ON t.id_mesa=vm.id_mesa JOIN jornada_operativa j ON j.id_jornada=o.id_jornada JOIN configuracion_operativa cfg ON cfg.id_configuracion=1 JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [input.id, input.clientId],
    );
  }
  async detailFindEntregaDomicilio(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindEntregaDomicilioRow[]> {
    return manager.query<DetailFindEntregaDomicilioRow[]>(
      `SELECT comprobante_hasta AS "receiptSubmissionDeadline",despachado_en AS "dispatchedAt",despachado_por AS "dispatchedBy",entregado_en AS "deliveredAt",entregado_por AS "deliveredBy",id_solicitud AS "requestId",destinatario AS "recipientName",telefono AS phone,direccion AS address,referencias AS references,latitud AS latitude,longitud AS longitude,version_configuracion AS "configurationVersion",tarifa_ctvs::float8 AS "shippingCents" FROM entrega_domicilio WHERE id_pedido=$1`,
      [input.id],
    );
  }
  async detailFindLiquidacion(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<DetailFindLiquidacionRow[]> {
    return manager.query<DetailFindLiquidacionRow[]>(
      'SELECT id_liquidacion AS id,estado AS status FROM liquidacion WHERE id_cuenta=$1 ORDER BY creada_en DESC LIMIT 1',
      [input.accountId],
    );
  }
  async detailFindDetallePedido(
    manager: EntityManager,
    input: { versionId: string },
  ): Promise<DetailFindDetallePedidoRow[]> {
    return manager.query<DetailFindDetallePedidoRow[]>(
      `SELECT d.id_detalle AS id,d.id_producto AS "productId",d.cantidad AS quantity,d.precio_unitario_ctvs AS "unitPriceCents",(d.cantidad::bigint*d.precio_unitario_ctvs)::float8 AS "subtotalCents",d.controla_stock_snapshot AS "tracksInventory",d.observaciones AS notes FROM detalle_pedido d WHERE d.id_version=$1 ORDER BY d.id_producto`,
      [input.versionId],
    );
  }
  async detailFindHistorialPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindHistorialPedidoRow[]> {
    return manager.query<DetailFindHistorialPedidoRow[]>(
      `SELECT actor_tipo AS "actorType",actor_usuario AS "userId",actor_sesion_cliente AS "guestSessionId",evento AS event,estado_anterior AS "previousStatus",estado_nuevo AS "newStatus",motivo AS reason,ocurrido_en AS "occurredAt" FROM historial_pedido WHERE id_pedido=$1 ORDER BY ocurrido_en,id_historial`,
      [input.id],
    );
  }
  async historyFindVersionPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<HistoryFindVersionPedidoRow[]> {
    return manager.query<HistoryFindVersionPedidoRow[]>(
      `SELECT id_version AS id,numero AS version,estado AS status,total_productos_ctvs::float8 AS "totalCents",observaciones AS notes,creada_en AS "createdAt" FROM version_pedido WHERE id_pedido=$1 ORDER BY numero`,
      [input.id],
    );
  }
  async historyFindDetallePedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<HistoryFindDetallePedidoRow[]> {
    return manager.query<HistoryFindDetallePedidoRow[]>(
      `SELECT id_detalle AS id,id_producto AS "productId",cantidad AS quantity,precio_unitario_ctvs AS "unitPriceCents",controla_stock_snapshot AS "tracksInventory",observaciones AS notes FROM detalle_pedido WHERE id_version=$1 ORDER BY id_producto`,
      [input.id],
    );
  }
  private async listFindOperation(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
  ): Promise<ListFindOperationRow[]> {
    return manager.query<ListFindOperationRow[]>(
      `SELECT count(*)::int AS total ${fragment0} WHERE ${fragment1}`,
      parameters,
    );
  }
  private async listFindOperationNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
  ): Promise<ListFindOperationNextRow[]> {
    return manager.query<ListFindOperationNextRow[]>(
      `SELECT o.id_pedido AS id ${fragment0} WHERE ${fragment1} ORDER BY o.enviado_en DESC,o.id_pedido DESC LIMIT $7 OFFSET $8`,
      parameters,
    );
  }

  async listOrderIds(
    manager: EntityManager,
    query: OrderQueryDto | AdminOrderQueryDto,
    clientId?: string,
  ) {
    const admin = query as AdminOrderQueryDto;
    const args = [
      clientId ?? null,
      query.visitId ?? null,
      admin.tableId ?? null,
      admin.operatingDayId ?? null,
      query.status ?? null,
      query.modality ?? null,
    ];
    const where = `($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::uuid IS NULL OR o.id_visita=$2) AND ($3::uuid IS NULL OR v.id_mesa=$3) AND ($4::uuid IS NULL OR o.id_jornada=$4) AND ($5::text IS NULL OR o.estado=$5) AND ($6::text IS NULL OR o.modalidad=$6)`;
    const from =
      'FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta LEFT JOIN visita_mesa v ON v.id_visita=o.id_visita';
    const [{ total }] = await this.listFindOperation(
      manager,
      args,
      from,
      where,
    );
    const rows: Array<{ id: string }> = await this.listFindOperationNext(
      manager,
      [...args, query.limit, (query.page - 1) * query.limit],
      from,
      where,
    );

    return { rows, total };
  }
}
