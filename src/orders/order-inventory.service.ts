import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Category } from '../catalog/entities/category.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { DailyInventory } from '../inventory/entities/daily-inventory.entity.js';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity.js';
import { InventoryReservation } from './entities/inventory-reservation.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import {
  CreateFindInventarioDiarioRow,
  EditFindProductoRow,
  EditFindInventarioDiarioRow,
  EditFindReservaInventarioRow,
  TransitionFindReservaInventarioRow,
} from './types/orders.types.js';

@Injectable()
export class OrderInventoryService {
  lockAvailableProducts(
    manager: EntityManager,
    input: { productIds: string[] },
  ): Promise<EditFindProductoRow[]> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select([
        'p.id_producto AS id',
        'p.precio_ctvs AS price',
        'p.controla_inventario AS tracks',
      ])
      .innerJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where(
        'p.id_producto=ANY(:ids::uuid[]) AND p.activo AND p.visible_menu AND c.activa',
      )
      .addOrderBy('p.id_producto', 'ASC')
      .setLock('pessimistic_read', undefined, ['p', 'c'])
      .setParameters({ ids: input.productIds })
      .getRawMany<EditFindProductoRow>();
  }

  async increaseReservedQuantity(
    manager: EntityManager,
    input: { inventoryId: string; quantity: number },
  ): Promise<void> {
    await manager
      .getRepository(DailyInventory)
      .createQueryBuilder()
      .update(DailyInventory)
      .set({ cantidad_reservada: () => 'cantidad_reservada+:quantity' })
      .where('id_inventario=:id')
      .setParameters({ id: input.inventoryId, quantity: input.quantity })
      .execute();
  }

  async createReservation(
    manager: EntityManager,
    input: { orderItemId: string; inventoryId: string; quantity: number },
  ): Promise<void> {
    await manager
      .getRepository(InventoryReservation)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_detalle: input.orderItemId,
          id_inventario: input.inventoryId,
          cantidad: input.quantity,
        },
      ])
      .execute();
  }

  lockAvailableInventory(
    manager: EntityManager,
    input: { operatingDayId: string; productIds: string[] },
  ): Promise<CreateFindInventarioDiarioRow[]> {
    return manager
      .getRepository(DailyInventory)
      .createQueryBuilder('inventario_diario')
      .select([
        'id_inventario AS id',
        'id_producto AS product',
        'cantidad_fisica-cantidad_reservada AS available',
      ])
      .where('id_jornada=:day AND id_producto=ANY(:ids::uuid[])')
      .addOrderBy('id_producto', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ day: input.operatingDayId, ids: input.productIds })
      .getRawMany<CreateFindInventarioDiarioRow>();
  }

  lockVersionReservations(
    manager: EntityManager,
    input: { versionId: string },
  ): Promise<EditFindReservaInventarioRow[]> {
    return manager
      .getRepository(InventoryReservation)
      .createQueryBuilder('r')
      .select([
        'r.id_reserva AS id',
        'r.id_inventario AS inventory',
        'r.cantidad AS quantity',
      ])
      .innerJoin(OrderItem, 'd', 'd.id_detalle=r.id_detalle')
      .where("d.id_version=:id_version AND r.estado='active'")
      .addOrderBy('r.id_inventario', 'ASC')
      .setLock('pessimistic_write', undefined, ['r'])
      .setParameters({ id_version: input.versionId })
      .getRawMany<EditFindReservaInventarioRow>();
  }

  lockReplacementInventory(
    manager: EntityManager,
    input: {
      operatingDayId: string;
      productIds: string[];
      reservedInventoryIds: string[];
    },
  ): Promise<EditFindInventarioDiarioRow[]> {
    return manager
      .getRepository(DailyInventory)
      .createQueryBuilder('inventario_diario')
      .select([
        'id_inventario AS id',
        'id_producto AS product',
        'cantidad_fisica-cantidad_reservada AS available',
      ])
      .where(
        'id_jornada=:id_jornada AND (id_producto=ANY(:ids::uuid[]) OR id_inventario=ANY(:reservedInventoryIds::uuid[]))',
      )
      .addOrderBy('id_producto', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({
        id_jornada: input.operatingDayId,
        ids: input.productIds,
        reservedInventoryIds: input.reservedInventoryIds,
      })
      .getRawMany<EditFindInventarioDiarioRow>();
  }

  async decreaseReservedQuantity(
    manager: EntityManager,
    input: { inventoryId: string; quantity: number },
  ): Promise<void> {
    await manager
      .getRepository(DailyInventory)
      .createQueryBuilder()
      .update(DailyInventory)
      .set({ cantidad_reservada: () => 'cantidad_reservada-:quantity' })
      .where('id_inventario=:inventory')
      .setParameters({ inventory: input.inventoryId, quantity: input.quantity })
      .execute();
  }

  async releaseReservation(
    manager: EntityManager,
    input: { reservationId: string },
  ): Promise<void> {
    await manager
      .getRepository(InventoryReservation)
      .createQueryBuilder()
      .update(InventoryReservation)
      .set({ estado: 'released', resuelta_en: () => 'clock_timestamp()' })
      .where('id_reserva=:id')
      .setParameters({ id: input.reservationId })
      .execute();
  }

  lockReservationsForConsumption(
    manager: EntityManager,
    input: { versionId: string },
  ): Promise<TransitionFindReservaInventarioRow[]> {
    return manager
      .getRepository(InventoryReservation)
      .createQueryBuilder('r')
      .select([
        'r.id_reserva AS id',
        'r.id_inventario AS inventory',
        'r.cantidad AS quantity',
        'i.cantidad_fisica AS physical',
      ])
      .innerJoin(OrderItem, 'd', 'd.id_detalle=r.id_detalle')
      .innerJoin(DailyInventory, 'i', 'i.id_inventario=r.id_inventario')
      .where("d.id_version=:id_version AND r.estado='active'")
      .addOrderBy('i.id_producto', 'ASC')
      .setLock('pessimistic_write', undefined, ['i', 'r'])
      .setParameters({ id_version: input.versionId })
      .getRawMany<TransitionFindReservaInventarioRow>();
  }

  async consumeReservedQuantity(
    manager: EntityManager,
    input: { inventoryId: string; quantity: number },
  ): Promise<void> {
    await manager
      .getRepository(DailyInventory)
      .createQueryBuilder()
      .update(DailyInventory)
      .set({
        cantidad_reservada: () => 'cantidad_reservada-:quantity',
        cantidad_fisica: () => 'cantidad_fisica-:quantity',
      })
      .where('id_inventario=:inventory')
      .setParameters({ inventory: input.inventoryId, quantity: input.quantity })
      .execute();
  }

  async recordConsumptionMovement(
    manager: EntityManager,
    input: {
      inventoryId: string;
      reservationId: string;
      userId: string | undefined;
      physicalDelta: number;
      previousQuantity: number;
      resultingQuantity: number;
    },
  ): Promise<void> {
    await manager
      .getRepository(InventoryMovement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_inventario: input.inventoryId,
          id_reserva: input.reservationId,
          registrado_por: input.userId,
          tipo: 'orderConsumption',
          delta_fisico: input.physicalDelta,
          cantidad_anterior: input.previousQuantity,
          cantidad_posterior: input.resultingQuantity,
          motivo: 'Preparación de pedido',
        },
      ])
      .execute();
  }

  async resolveReservation(
    manager: EntityManager,
    input: { reservationId: string; status: 'released' | 'consumed' },
  ): Promise<void> {
    await manager
      .getRepository(InventoryReservation)
      .createQueryBuilder()
      .update(InventoryReservation)
      .set({ estado: input.status, resuelta_en: () => 'clock_timestamp()' })
      .where('id_reserva=:id')
      .setParameters({ id: input.reservationId })
      .execute();
  }
}
