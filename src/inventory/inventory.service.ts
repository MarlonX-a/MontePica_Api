import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AuditRepository } from '../database/repositories/audit.repository.js';
import type { InitializeInventoryDto } from './dto/initialize-inventory.dto.js';
import type {
  CreateInventoryAdjustmentDto,
  CreateInventoryMovementDto,
} from './dto/inventory-movement.dto.js';
import type {
  ListInventoryMovementsQueryDto,
  ListInventoryQueryDto,
  ListOperatingDaysQueryDto,
} from './dto/list-inventory-query.dto.js';
import { InventoryRepository } from './repositories/inventory.repository.js';

const maxInteger = 2_147_483_647;
const validMovementTypes = new Set([
  'initialization',
  'restock',
  'internalConsumption',
  'giveaway',
  'waste',
  'adjustment',
]);

type InventoryItem = {
  inventoryId: string;
  product: { id: string; sku: string; name: string; categoryId: string };
  initialized: boolean;
  initialQuantity: number | null;
  physicalQuantity: number | null;
  reservedQuantity: number | null;
  availableQuantity: number | null;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly persistence: InventoryRepository = new InventoryRepository(),
    private readonly auditRecords: AuditRepository = new AuditRepository(),
  ) {}

  async listOperatingDays(query: ListOperatingDaysQueryDto) {
    this.validateDayFilters(query);
    return this.persistence.listOperatingDays(this.dataSource.manager, query);
  }

  async listInventory(dayId: string, query: ListInventoryQueryDto) {
    await this.assertOperatingDayExists(dayId);
    return this.persistence.listInventory(
      this.dataSource.manager,
      dayId,
      query,
    );
  }

  async getInventoryItem(
    dayId: string,
    productId: string,
  ): Promise<InventoryItem> {
    await this.assertOperatingDayExists(dayId);
    const rows = await this.persistence.getInventoryItemFindProducto(
      this.dataSource.manager,
      { dayId: dayId, productId: productId },
    );
    if (!rows[0])
      throw new NotFoundException(
        'Producto no encontrado en el inventario de esa jornada.',
      );
    return rows[0] as InventoryItem;
  }

  async listMovements(dayId: string, query: ListInventoryMovementsQueryDto) {
    await this.assertOperatingDayExists(dayId);
    this.validateMovementFilter(query.type);
    return this.persistence.listMovements(
      this.dataSource.manager,
      dayId,
      query,
    );
  }

  async initialize(
    dayId: string,
    dto: InitializeInventoryDto,
    idempotencyKey: string | undefined,
    actor: AuthenticatedRequestContext,
  ) {
    const normalizedItems = dto.items.map((item) => ({
      ...item,
      productId: item.productId.toLowerCase(),
    }));
    const normalizedDto = { items: normalizedItems };
    const operation = `POST:/admin/operating-days/${dayId.toLowerCase()}/inventory/initialize`;
    return this.idempotent(
      operation,
      idempotencyKey,
      normalizedDto,
      actor,
      async (manager) => {
        await this.lockCurrentOperatingDay(manager, dayId);
        const ids = normalizedItems.map((item) => item.productId);
        if (new Set(ids).size !== ids.length)
          throw new BadRequestException('No repitas productos en el lote.');
        const sortedIds = [...ids].sort((a, b) => a.localeCompare(b, 'en'));
        const products = await this.persistence.initializeFindProducto(
          manager,
          { sortedIds: sortedIds },
        );
        if (products.length !== ids.length) {
          throw new BadRequestException(
            'Todos los productos deben existir, estar activos y controlar inventario.',
          );
        }
        const productById = new Map(
          products.map((product: { id: string }) => [product.id, product]),
        );
        const result: InventoryItem[] = [];
        for (const item of normalizedItems) {
          const product = productById.get(item.productId);
          const existing =
            await this.persistence.initializeFindInventarioDiario(manager, {
              dayId: dayId,
              productId: item.productId,
            });
          if (existing[0])
            throw new ConflictException(
              `El producto ${item.productId} ya está inicializado en esta jornada.`,
            );
          const inserted =
            await this.persistence.initializeInsertInventarioDiario(manager, {
              dayId: dayId,
              productId: item.productId,
              initialQuantity: item.initialQuantity,
              userId: actor.userId,
            });
          const inventory = inserted[0];
          const movement =
            await this.persistence.initializeInsertMovimientoInventario(
              manager,
              {
                inventoryId: inventory.inventoryId,
                userId: actor.userId,
                initialQuantity: item.initialQuantity,
              },
            );
          const response: InventoryItem = {
            inventoryId: inventory.inventoryId,
            product: product as InventoryItem['product'],
            initialized: true,
            initialQuantity: inventory.initialQuantity,
            physicalQuantity: inventory.physicalQuantity,
            reservedQuantity: inventory.reservedQuantity,
            availableQuantity:
              inventory.physicalQuantity - inventory.reservedQuantity,
          };
          await this.audit(
            manager,
            actor,
            'inventario_diario',
            inventory.inventoryId,
            'inventory.initialized',
            {},
            {
              inventory: response,
              movement: movement[0],
            },
          );
          result.push(response);
        }
        return { items: result };
      },
    );
  }

  async createMovement(
    dayId: string,
    productId: string,
    dto: CreateInventoryMovementDto,
    idempotencyKey: string | undefined,
    actor: AuthenticatedRequestContext,
  ) {
    const normalizedDto = { ...dto, reason: this.cleanReason(dto.reason) };
    const operation = `POST:/admin/operating-days/${dayId.toLowerCase()}/inventory/${productId.toLowerCase()}/movements`;
    return this.idempotent(
      operation,
      idempotencyKey,
      normalizedDto,
      actor,
      async (manager) => {
        await this.lockCurrentOperatingDay(manager, dayId);
        const { inventory, product } = await this.lockInventory(
          manager,
          dayId,
          productId,
        );
        const reason = normalizedDto.reason;
        const delta = dto.type === 'restock' ? dto.quantity : -dto.quantity;
        const result = await this.writeMovement(
          manager,
          actor,
          inventory,
          product,
          dto.type,
          delta,
          reason,
        );
        await this.audit(
          manager,
          actor,
          'inventario_diario',
          inventory.id,
          `inventory.${dto.type}`,
          result.before,
          result.after,
        );
        return result.after;
      },
    );
  }

  async adjust(
    dayId: string,
    productId: string,
    dto: CreateInventoryAdjustmentDto,
    idempotencyKey: string | undefined,
    actor: AuthenticatedRequestContext,
  ) {
    const normalizedDto = { ...dto, reason: this.cleanReason(dto.reason) };
    const operation = `POST:/admin/operating-days/${dayId.toLowerCase()}/inventory/${productId.toLowerCase()}/adjustments`;
    return this.idempotent(
      operation,
      idempotencyKey,
      normalizedDto,
      actor,
      async (manager) => {
        await this.lockCurrentOperatingDay(manager, dayId);
        const { inventory, product } = await this.lockInventory(
          manager,
          dayId,
          productId,
        );
        const reason = normalizedDto.reason;
        const delta = dto.countedQuantity - inventory.physicalQuantity;
        if (delta === 0)
          throw new BadRequestException(
            'El conteo coincide con la existencia actual; no hay ajuste que registrar.',
          );
        if (dto.countedQuantity < inventory.reservedQuantity) {
          throw new ConflictException(
            'El conteo no puede ser inferior a las unidades reservadas.',
          );
        }
        const result = await this.writeMovement(
          manager,
          actor,
          inventory,
          product,
          'adjustment',
          delta,
          reason,
          dto.countedQuantity,
        );
        await this.audit(
          manager,
          actor,
          'inventario_diario',
          inventory.id,
          'inventory.adjustment',
          result.before,
          result.after,
        );
        return result.after;
      },
    );
  }

  private validateDayFilters(query: ListOperatingDaysQueryDto) {
    if (query.status && !['open', 'closed'].includes(query.status))
      throw new BadRequestException('El estado debe ser open o closed.');
    for (const date of [query.fromDate, query.toDate]) {
      if (date !== undefined && !this.isCalendarDate(date))
        throw new BadRequestException(
          'Las fechas deben ser fechas válidas con formato YYYY-MM-DD.',
        );
    }
    if (query.fromDate && query.toDate && query.fromDate > query.toDate)
      throw new BadRequestException(
        'fromDate no puede ser posterior a toDate.',
      );
  }

  private async assertOperatingDayExists(dayId: string) {
    const rows =
      await this.persistence.assertOperatingDayExistsFindJornadaOperativa(
        this.dataSource.manager,
        { dayId: dayId },
      );
    if (!rows[0]) throw new NotFoundException('Jornada no encontrada.');
  }

  private isCalendarDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }

  private validateMovementFilter(type?: string) {
    if (type && !validMovementTypes.has(type))
      throw new BadRequestException('El tipo de movimiento no es válido.');
  }

  private async lockCurrentOperatingDay(manager: EntityManager, dayId: string) {
    await this.persistence.lockCurrentOperatingDayFindOperation(manager);
    const settings =
      await this.persistence.lockCurrentOperatingDayFindConfiguracionOperativa(
        manager,
      );
    if (!settings[0])
      throw new ConflictException('No existe configuración operativa.');
    const dates =
      await this.persistence.lockCurrentOperatingDayFindOperationNext(manager, {
        timeZone: settings[0].timeZone,
      });
    const days =
      await this.persistence.lockCurrentOperatingDayFindJornadaOperativa(
        manager,
        { dayId: dayId },
      );
    if (!days[0]) throw new NotFoundException('Jornada no encontrada.');
    if (
      days[0].status !== 'open' ||
      this.dateString(days[0].businessDate) !==
        this.dateString(dates[0].businessDate)
    ) {
      throw new ConflictException(
        'Solo se puede modificar el inventario de la jornada abierta de la fecha operativa actual.',
      );
    }
    return days[0];
  }

  private async lockInventory(
    manager: EntityManager,
    dayId: string,
    productId: string,
  ) {
    const rows = await this.persistence.lockInventoryFindInventarioDiario(
      manager,
      { dayId: dayId, productId: productId },
    );
    if (!rows[0])
      throw new NotFoundException(
        'El producto no está inicializado en esta jornada.',
      );
    return { inventory: rows[0], product: rows[0] };
  }

  private async writeMovement(
    manager: EntityManager,
    actor: AuthenticatedRequestContext,
    inventory: {
      id: string;
      initialQuantity: number;
      physicalQuantity: number;
      reservedQuantity: number;
    },
    product: { productId: string; sku: string; productName: string },
    type: string,
    delta: number,
    reason: string,
    countedQuantity?: number,
  ) {
    const beforeQuantity = Number(inventory.physicalQuantity);
    const nextQuantity = countedQuantity ?? beforeQuantity + delta;
    if (
      !Number.isSafeInteger(nextQuantity) ||
      nextQuantity < inventory.reservedQuantity ||
      nextQuantity > maxInteger
    ) {
      throw new ConflictException(
        'El movimiento dejaría un saldo inválido o inferior a las unidades reservadas.',
      );
    }
    const before = {
      inventoryId: inventory.id,
      productId: product.productId,
      productName: product.productName,
      initialQuantity: Number(inventory.initialQuantity),
      physicalQuantity: beforeQuantity,
      reservedQuantity: Number(inventory.reservedQuantity),
      availableQuantity: beforeQuantity - Number(inventory.reservedQuantity),
    };
    await this.persistence.writeMovementUpdateInventarioDiario(manager, {
      id: inventory.id,
      nextQuantity: nextQuantity,
    });
    const rows = await this.persistence.writeMovementInsertMovimientoInventario(
      manager,
      {
        id: inventory.id,
        userId: actor.userId,
        type: type,
        delta: delta,
        beforeQuantity: beforeQuantity,
        nextQuantity: nextQuantity,
        reason: reason,
      },
    );
    const after = {
      ...before,
      physicalQuantity: nextQuantity,
      availableQuantity: nextQuantity - Number(inventory.reservedQuantity),
      movement: rows[0],
    };
    return { before, after };
  }

  private async idempotent<T>(
    operation: string,
    key: string | undefined,
    request: unknown,
    actor: AuthenticatedRequestContext,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (!key || key.length < 1 || key.length > 128 || key.trim() !== key) {
      throw new BadRequestException(
        'Envía Idempotency-Key con entre 1 y 128 caracteres, sin espacios externos.',
      );
    }
    const requestHash = createHash('sha256')
      .update(this.canonicalJson(request))
      .digest('hex');
    const lockKey = `${actor.userId}:${operation}:${key}`;
    return this.dataSource.transaction(async (manager) => {
      await this.persistence.idempotentFindOperation(manager, {
        lockKey: lockKey,
      });
      const existing = await this.persistence.idempotentFindIdempotencia(
        manager,
        { userId: actor.userId, operation: operation, key: key },
      );
      if (existing[0]) {
        if (existing[0].requestHash !== requestHash)
          throw new ConflictException(
            'Idempotency-Key ya fue usada con otro contenido.',
          );
        return existing[0].response as T;
      }
      const response = await action(manager);
      const resourceType = operation.includes('/initialize')
        ? 'inventario_diario'
        : 'movimiento_inventario';
      const resourceId = operation.includes('/initialize')
        ? ((response as { items?: InventoryItem[] }).items?.[0]?.inventoryId ??
          null)
        : ((response as { movement?: { id: string } }).movement?.id ?? null);
      await this.persistence.idempotentInsertIdempotencia(manager, {
        userId: actor.userId,
        operation: operation,
        key: key,
        requestHash: requestHash,
        response: JSON.stringify(response),
        resourceType: resourceType,
        resourceId: resourceId,
      });
      return response;
    });
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([a], [b]) => a.localeCompare(b),
      );
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private cleanReason(reason: string) {
    const normalized = reason.trim();
    if (!normalized) throw new BadRequestException('El motivo es obligatorio.');
    return normalized;
  }

  private dateString(value: string | Date) {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  }

  private async audit(
    manager: EntityManager,
    actor: AuthenticatedRequestContext,
    resourceType: string,
    resourceId: string,
    event: string,
    before: unknown,
    after: unknown,
  ) {
    await this.auditRecords.append(
      manager,
      actor,
      resourceType,
      resourceId,
      event,
      { before, after },
    );
  }
}
