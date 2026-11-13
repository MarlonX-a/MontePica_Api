import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { ConsumptionAssignment } from '../accounts/entities/consumption-assignment.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { DailyInventory } from '../inventory/entities/daily-inventory.entity.js';
import { InventoryReservation } from '../orders/entities/inventory-reservation.entity.js';
import { OrderHistory } from '../orders/entities/order-history.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { OrderVersion } from '../orders/entities/order-version.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { SettlementItem } from '../settlements/entities/settlement-item.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { DeliveryDetails } from './entities/delivery-details.entity.js';
import {
  ExpireDeliveryFindPagoRow,
  ExpireDeliveryFindPedidoRow,
  ExpireDeliveryFindReservaInventarioRow,
} from './types/delivery-expiry-resolution.types.js';

@Injectable()
export class DeliveryLifecycleService {
  constructor(private readonly auditLog: AuditService) {}

  expireDeliveryFindPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<ExpireDeliveryFindPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('o.id_cuenta, v.id_version')
      .innerJoin(DeliveryDetails, 'e', 'e.id_pedido=o.id_pedido')
      .innerJoin(
        OrderVersion,
        'v',
        "v.id_pedido=o.id_pedido AND v.estado='current'",
      )
      .where(
        "o.id_pedido=:id AND o.estado='submitted' AND e.comprobante_hasta<=clock_timestamp()",
      )
      .setLock('pessimistic_write', undefined, ['o', 'v', 'e'])
      .setParameters({ id: input.id })
      .getRawMany<ExpireDeliveryFindPedidoRow>();
  }

  async expireDeliveryFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('cuenta_consumo')
      .select('1 AS "1"')
      .where('id_cuenta=:id_cuenta')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany();
  }

  expireDeliveryFindPago(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<ExpireDeliveryFindPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select('1 AS "1"')
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .where(
        "l.id_cuenta=:id_cuenta AND p.estado IN ('confirmed','pendingVerification')",
      )
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<ExpireDeliveryFindPagoRow>();
  }

  expireDeliveryFindReservaInventario(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<ExpireDeliveryFindReservaInventarioRow[]> {
    return manager
      .getRepository(InventoryReservation)
      .createQueryBuilder('r')
      .select([
        'r.id_reserva AS id',
        'r.id_inventario AS inventory',
        'r.cantidad AS quantity',
      ])
      .innerJoin(OrderItem, 'd', 'd.id_detalle=r.id_detalle')
      .innerJoin(DailyInventory, 'i', 'i.id_inventario=r.id_inventario')
      .where("d.id_version=:id_version AND r.estado='active'")
      .addOrderBy('i.id_producto', 'ASC')
      .setLock('pessimistic_write', undefined, ['i', 'r'])
      .setParameters({ id_version: input.id_version })
      .getRawMany<ExpireDeliveryFindReservaInventarioRow>();
  }

  async expireDeliveryUpdateInventarioDiario(
    manager: EntityManager,
    input: { inventory: string; quantity: number },
  ): Promise<void> {
    await manager
      .getRepository(DailyInventory)
      .createQueryBuilder()
      .update(DailyInventory)
      .set({ cantidad_reservada: () => 'cantidad_reservada-:quantity' })
      .where('id_inventario=:inventory')
      .setParameters({ inventory: input.inventory, quantity: input.quantity })
      .execute();
  }

  async expireDeliveryUpdateReservaInventario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(InventoryReservation)
      .createQueryBuilder()
      .update(InventoryReservation)
      .set({ estado: 'released', resuelta_en: () => 'clock_timestamp()' })
      .where('id_reserva=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  async expireDeliveryUpdateAsignacionConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder()
      .update(ConsumptionAssignment)
      .set({ estado: 'superseded' })
      .where("id_cuenta=:id_cuenta AND estado='active'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  async expireDeliveryUpdateLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(Settlement)
      .createQueryBuilder()
      .update(Settlement)
      .set({
        estado: 'cancelled',
        anulada_en: () => 'clock_timestamp()',
        motivo_anulacion: 'receiptDeadlineExpired',
      })
      .where("id_cuenta=:id_cuenta AND estado='pending'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  async expireDeliveryUpdateDetalleLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(SettlementItem)
      .createQueryBuilder()
      .update(SettlementItem)
      .set({ vigente: false })
      .where(
        'id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=:id_cuenta)',
      )
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  async expireDeliveryUpdateCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder()
      .update(ConsumptionAccount)
      .set({ estado: 'closed', cerrada_en: () => 'clock_timestamp()' })
      .where('id_cuenta=:id_cuenta')
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  async expireDeliveryUpdatePedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(Order)
      .createQueryBuilder()
      .update(Order)
      .set({ estado: 'cancelled' })
      .where('id_pedido=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  async expireDeliveryInsertHistorialPedido(
    manager: EntityManager,
    input: { id: string; id_version: string },
  ): Promise<void> {
    await manager
      .getRepository(OrderHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.id,
          id_version: input.id_version,
          actor_tipo: 'system',
          evento: 'order.expired',
          estado_anterior: 'submitted',
          estado_nuevo: 'cancelled',
          motivo: 'receiptDeadlineExpired',
        },
      ])
      .execute();
  }

  async expireDelivery(m: EntityManager, id: string): Promise<boolean> {
    const [o] = await this.expireDeliveryFindPedido(m, { id });
    if (!o) return false;
    await this.expireDeliveryFindCuentaConsumo(m, {
      id_cuenta: o.id_cuenta,
    });
    const [payment] = await this.expireDeliveryFindPago(m, {
      id_cuenta: o.id_cuenta,
    });
    if (payment) return false;
    const reserves: Array<{ id: string; inventory: string; quantity: number }> =
      await this.expireDeliveryFindReservaInventario(m, {
        id_version: o.id_version,
      });
    for (const r of reserves) {
      await this.expireDeliveryUpdateInventarioDiario(m, {
        inventory: r.inventory,
        quantity: r.quantity,
      });
      await this.expireDeliveryUpdateReservaInventario(m, { id: r.id });
    }
    await this.expireDeliveryUpdateAsignacionConsumo(m, {
      id_cuenta: o.id_cuenta,
    });
    await this.expireDeliveryUpdateLiquidacion(m, {
      id_cuenta: o.id_cuenta,
    });
    await this.expireDeliveryUpdateDetalleLiquidacion(m, {
      id_cuenta: o.id_cuenta,
    });
    await this.expireDeliveryUpdateCuentaConsumo(m, {
      id_cuenta: o.id_cuenta,
    });
    await this.expireDeliveryUpdatePedido(m, { id });
    await this.expireDeliveryInsertHistorialPedido(m, {
      id,
      id_version: o.id_version,
    });
    await this.auditLog.append(m, {}, 'pedido', id, 'order.expired', {
      reason: 'receiptDeadlineExpired',
    });
    return true;
  }
}
