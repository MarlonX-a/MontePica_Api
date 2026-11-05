import type { EntityManager } from 'typeorm';
import { DeliveryExpiryResolutionRepository } from './repositories/delivery-expiry-resolution.repository.js';
import { auditTableOperation } from './table-audit.js';
const persistence = new DeliveryExpiryResolutionRepository();
// Caller holds the common operational lock. Each invocation is part of its caller transaction.
export async function expireDelivery(
  m: EntityManager,
  id: string,
): Promise<boolean> {
  const [o] = await persistence.expireDeliveryFindPedido(m, { id: id });
  if (!o) return false;
  await persistence.expireDeliveryFindCuentaConsumo(m, {
    id_cuenta: o.id_cuenta,
  });
  const [payment] = await persistence.expireDeliveryFindPago(m, {
    id_cuenta: o.id_cuenta,
  });
  if (payment) return false;
  const reserves: Array<{ id: string; inventory: string; quantity: number }> =
    await persistence.expireDeliveryFindReservaInventario(m, {
      id_version: o.id_version,
    });
  for (const r of reserves) {
    await persistence.expireDeliveryUpdateInventarioDiario(m, {
      inventory: r.inventory,
      quantity: r.quantity,
    });
    await persistence.expireDeliveryUpdateReservaInventario(m, { id: r.id });
  }
  await persistence.expireDeliveryUpdateAsignacionConsumo(m, {
    id_cuenta: o.id_cuenta,
  });
  await persistence.expireDeliveryUpdateLiquidacion(m, {
    id_cuenta: o.id_cuenta,
  });
  await persistence.expireDeliveryUpdateDetalleLiquidacion(m, {
    id_cuenta: o.id_cuenta,
  });
  await persistence.expireDeliveryUpdateCuentaConsumo(m, {
    id_cuenta: o.id_cuenta,
  });
  await persistence.expireDeliveryUpdatePedido(m, { id: id });
  await persistence.expireDeliveryInsertHistorialPedido(m, {
    id: id,
    id_version: o.id_version,
  });
  await auditTableOperation(m, {}, 'pedido', id, 'order.expired', {
    reason: 'receiptDeadlineExpired',
  });
  return true;
}
