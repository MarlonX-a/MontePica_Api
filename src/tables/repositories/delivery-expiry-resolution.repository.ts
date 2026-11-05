import type { EntityManager } from 'typeorm';
export interface ExpireDeliveryFindPedidoRow {
  id_cuenta: string;
  id_version: string;
}
export interface ExpireDeliveryFindPagoRow {
  '1': string;
}
export interface ExpireDeliveryFindReservaInventarioRow {
  id: string;
  inventory: string;
  quantity: number;
}
export class DeliveryExpiryResolutionRepository {
  async expireDeliveryFindPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<ExpireDeliveryFindPedidoRow[]> {
    return manager.query<ExpireDeliveryFindPedidoRow[]>(
      `SELECT o.id_cuenta,v.id_version FROM pedido o JOIN entrega_domicilio e ON e.id_pedido=o.id_pedido JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 AND o.estado='submitted' AND e.comprobante_hasta<=clock_timestamp() FOR UPDATE OF o,v,e`,
      [input.id],
    );
  }
  async expireDeliveryFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      'SELECT 1 FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',
      [input.id_cuenta],
    );
  }
  async expireDeliveryFindPago(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<ExpireDeliveryFindPagoRow[]> {
    return manager.query<ExpireDeliveryFindPagoRow[]>(
      `SELECT 1 FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado IN ('confirmed','pendingVerification')`,
      [input.id_cuenta],
    );
  }
  async expireDeliveryFindReservaInventario(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<ExpireDeliveryFindReservaInventarioRow[]> {
    return manager.query<ExpireDeliveryFindReservaInventarioRow[]>(
      `SELECT r.id_reserva AS id,r.id_inventario AS inventory,r.cantidad AS quantity FROM reserva_inventario r JOIN detalle_pedido d ON d.id_detalle=r.id_detalle JOIN inventario_diario i ON i.id_inventario=r.id_inventario WHERE d.id_version=$1 AND r.estado='active' ORDER BY i.id_producto FOR UPDATE OF i,r`,
      [input.id_version],
    );
  }
  async expireDeliveryUpdateInventarioDiario(
    manager: EntityManager,
    input: { inventory: string; quantity: number },
  ): Promise<void> {
    await manager.query(
      'UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-$2 WHERE id_inventario=$1',
      [input.inventory, input.quantity],
    );
  }
  async expireDeliveryUpdateReservaInventario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE reserva_inventario SET estado='released',resuelta_en=clock_timestamp() WHERE id_reserva=$1`,
      [input.id],
    );
  }
  async expireDeliveryUpdateAsignacionConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE asignacion_consumo SET estado='superseded' WHERE id_cuenta=$1 AND estado='active'`,
      [input.id_cuenta],
    );
  }
  async expireDeliveryUpdateLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE liquidacion SET estado='cancelled',anulada_en=clock_timestamp(),motivo_anulacion='receiptDeadlineExpired' WHERE id_cuenta=$1 AND estado='pending'`,
      [input.id_cuenta],
    );
  }
  async expireDeliveryUpdateDetalleLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE detalle_liquidacion SET vigente=false WHERE id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=$1)`,
      [input.id_cuenta],
    );
  }
  async expireDeliveryUpdateCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,
      [input.id_cuenta],
    );
  }
  async expireDeliveryUpdatePedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE pedido SET estado='cancelled' WHERE id_pedido=$1`,
      [input.id],
    );
  }
  async expireDeliveryInsertHistorialPedido(
    manager: EntityManager,
    input: { id: string; id_version: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pedido(id_pedido,id_version,actor_tipo,evento,estado_anterior,estado_nuevo,motivo) VALUES ($1,$2,'system','order.expired','submitted','cancelled','receiptDeadlineExpired')`,
      [input.id, input.id_version],
    );
  }
}
