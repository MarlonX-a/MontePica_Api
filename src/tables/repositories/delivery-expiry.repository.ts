import type { EntityManager } from 'typeorm';
export interface SweepFindPedidoRow {
  id: string;
}
export class DeliveryExpiryRepository {
  async sweepFindPedido(manager: EntityManager): Promise<SweepFindPedidoRow[]> {
    return manager.query<SweepFindPedidoRow[]>(
      `SELECT o.id_pedido AS id FROM pedido o JOIN entrega_domicilio e ON e.id_pedido=o.id_pedido WHERE o.estado='submitted' AND e.comprobante_hasta<=clock_timestamp() ORDER BY e.comprobante_hasta,o.id_pedido`,
      [],
    );
  }
}
