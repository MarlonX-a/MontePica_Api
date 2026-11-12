import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { Category } from '../catalog/entities/category.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { IdempotencyRecord } from '../common/idempotency/entities/idempotency-record.entity.js';
import { TransactionLocksService } from '../common/transactions/transaction-locks.service.js';
import { OperatingDayClosure } from '../operations/entities/operating-day-closure.entity.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../operations/entities/operations-settings.entity.js';
import { type CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto.js';
import { type CreateInventoryMovementDto } from './dto/create-inventory-movement.dto.js';
import { type InitializeInventoryDto } from './dto/initialize-inventory.dto.js';
import { type ListInventoryMovementsQueryDto } from './dto/list-inventory-movements-query.dto.js';
import { type ListInventoryQueryDto } from './dto/list-inventory-query.dto.js';
import { type ListOperatingDaysQueryDto } from './dto/list-operating-days-query.dto.js';
import { DailyInventory } from './entities/daily-inventory.entity.js';
import { InventoryMovement } from './entities/inventory-movement.entity.js';
import {
  AssertOperatingDayExistsFindJornadaOperativaRow,
  GetInventoryItemFindProductoRow,
  IdempotentFindIdempotenciaRow,
  InitializeFindInventarioDiarioRow,
  InitializeFindProductoRow,
  InitializeInsertInventarioDiarioRow,
  InitializeInsertMovimientoInventarioRow,
  LockCurrentOperatingDayFindConfiguracionOperativaRow,
  LockCurrentOperatingDayFindJornadaOperativaRow,
  LockCurrentOperatingDayFindOperationNextRow,
  LockInventoryFindInventarioDiarioRow,
  pageArgs,
  WriteMovementInsertMovimientoInventarioRow,
} from './types/inventory.types.js';

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
    @InjectRepository(DailyInventory)
    private readonly records: Repository<DailyInventory>,
    private readonly dataSource: DataSource,
    private readonly auditRecords: AuditService,
    private readonly locks: TransactionLocksService,
  ) {}

  async listOperatingDays(query: ListOperatingDaysQueryDto) {
    this.validateDayFilters(query);
    return this.queryListOperatingDays(this.records.manager, query);
  }

  async listInventory(dayId: string, query: ListInventoryQueryDto) {
    await this.assertOperatingDayExists(dayId);
    return this.queryListInventory(this.records.manager, dayId, query);
  }

  async getInventoryItem(
    dayId: string,
    productId: string,
  ): Promise<InventoryItem> {
    await this.assertOperatingDayExists(dayId);
    const rows = await this.getInventoryItemFindProducto(this.records.manager, {
      dayId,
      productId,
    });
    if (!rows[0])
      throw new NotFoundException(
        'Producto no encontrado en el inventario de esa jornada.',
      );
    return rows[0] as InventoryItem;
  }

  async listMovements(dayId: string, query: ListInventoryMovementsQueryDto) {
    await this.assertOperatingDayExists(dayId);
    this.validateMovementFilter(query.type);
    return this.queryListMovements(this.records.manager, dayId, query);
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
        const products = await this.initializeFindProducto(manager, {
          sortedIds,
        });
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
          const existing = await this.initializeFindInventarioDiario(manager, {
            dayId,
            productId: item.productId,
          });
          if (existing[0])
            throw new ConflictException(
              `El producto ${item.productId} ya está inicializado en esta jornada.`,
            );
          const inserted = await this.initializeInsertInventarioDiario(
            manager,
            {
              dayId,
              productId: item.productId,
              initialQuantity: item.initialQuantity,
              userId: actor.userId,
            },
          );
          const inventory = inserted[0];
          const movement = await this.initializeInsertMovimientoInventario(
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
    const rows = await this.assertOperatingDayExistsFindJornadaOperativa(
      this.records.manager,
      { dayId },
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
    await this.lockCurrentOperatingDayFindOperation(manager);
    const settings =
      await this.lockCurrentOperatingDayFindConfiguracionOperativa(manager);
    if (!settings[0])
      throw new ConflictException('No existe configuración operativa.');
    const dates = await this.lockCurrentOperatingDayFindOperationNext(manager, {
      timeZone: settings[0].timeZone,
    });
    const days = await this.lockCurrentOperatingDayFindJornadaOperativa(
      manager,
      { dayId },
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
    const rows = await this.lockInventoryFindInventarioDiario(manager, {
      dayId,
      productId,
    });
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
    await this.writeMovementUpdateInventarioDiario(manager, {
      id: inventory.id,
      nextQuantity,
    });
    const rows = await this.writeMovementInsertMovimientoInventario(manager, {
      id: inventory.id,
      userId: actor.userId,
      type,
      delta,
      beforeQuantity,
      nextQuantity,
      reason,
    });
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
      await this.idempotentFindOperation(manager, {
        lockKey,
      });
      const existing = await this.idempotentFindIdempotencia(manager, {
        userId: actor.userId,
        operation,
        key,
      });
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
      await this.idempotentInsertIdempotencia(manager, {
        userId: actor.userId,
        operation,
        key,
        requestHash,
        response: JSON.stringify(response),
        resourceType,
        resourceId,
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

  private async getInventoryItemFindProducto(
    manager: EntityManager,
    input: { dayId: string; productId: string },
  ): Promise<GetInventoryItemFindProductoRow[]> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select([
        'i."id_inventario" AS "inventoryId"',
        'jsonb_build_object(\'id\', p."id_producto", \'sku\', p."sku", \'name\', p."nombre", \'categoryId\', c."id_categoria") AS product',
        '(i."id_inventario" IS NOT NULL) AS initialized',
        'i."cantidad_inicial" AS "initialQuantity"',
        'i."cantidad_fisica" AS "physicalQuantity"',
        'i."cantidad_reservada" AS "reservedQuantity"',
        'i."cantidad_fisica" - i."cantidad_reservada" AS "availableQuantity"',
      ])
      .innerJoin(Category, 'c', 'c."id_categoria" = p."id_categoria"')
      .leftJoin(
        DailyInventory,
        'i',
        'i."id_producto" = p."id_producto" AND i."id_jornada" = :dayId',
      )
      .where(
        'p."id_producto" = :productId AND (i."id_inventario" IS NOT NULL OR (p."activo" = true AND p."controla_inventario" = true))',
      )
      .setParameters({ dayId: input.dayId, productId: input.productId })
      .getRawMany<GetInventoryItemFindProductoRow>();
  }

  private async initializeFindProducto(
    manager: EntityManager,
    input: { sortedIds: string[] },
  ): Promise<InitializeFindProductoRow[]> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select(
        'p."id_producto" AS id, p."sku", p."nombre" AS name, c."id_categoria" AS "categoryId"',
      )
      .innerJoin(Category, 'c', 'c."id_categoria" = p."id_categoria"')
      .where(
        'p."id_producto" = ANY(:sortedIds::uuid[]) AND p."activo" = true AND p."controla_inventario" = true',
      )
      .addOrderBy('p."id_producto"', 'ASC')
      .setLock('pessimistic_write', undefined, ['p'])
      .setParameters({ sortedIds: input.sortedIds })
      .getRawMany<InitializeFindProductoRow>();
  }

  private async initializeFindInventarioDiario(
    manager: EntityManager,
    input: { dayId: string; productId: string },
  ): Promise<InitializeFindInventarioDiarioRow[]> {
    return manager
      .getRepository(DailyInventory)
      .createQueryBuilder('inventario_diario')
      .select('1 AS "1"')
      .where('"id_jornada" = :dayId AND "id_producto" = :productId')
      .setParameters({ dayId: input.dayId, productId: input.productId })
      .getRawMany<InitializeFindInventarioDiarioRow>();
  }

  private async initializeInsertInventarioDiario(
    manager: EntityManager,
    input: {
      dayId: string;
      productId: string;
      initialQuantity: number;
      userId: string;
    },
  ): Promise<InitializeInsertInventarioDiarioRow[]> {
    return manager
      .getRepository(DailyInventory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_jornada: input.dayId,
          id_producto: input.productId,
          cantidad_inicial: input.initialQuantity,
          cantidad_fisica: input.initialQuantity,
          cantidad_reservada: 0,
          inicializado_por: input.userId,
        },
      ])
      .returning(
        '"id_inventario" AS "inventoryId", "cantidad_inicial" AS "initialQuantity",\n             "cantidad_fisica" AS "physicalQuantity", "cantidad_reservada" AS "reservedQuantity"',
      )
      .execute()
      .then((result) => result.raw);
  }

  private async initializeInsertMovimientoInventario(
    manager: EntityManager,
    input: { inventoryId: string; userId: string; initialQuantity: number },
  ): Promise<InitializeInsertMovimientoInventarioRow[]> {
    return manager
      .getRepository(InventoryMovement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_inventario: input.inventoryId,
          registrado_por: input.userId,
          tipo: 'initialization',
          delta_fisico: input.initialQuantity,
          cantidad_anterior: 0,
          cantidad_posterior: input.initialQuantity,
          motivo: 'Inicialización de inventario diario',
        },
      ])
      .returning(
        '"id_movimiento" AS id, "tipo" AS type, "delta_fisico" AS "physicalDelta",\n             "cantidad_anterior" AS "previousQuantity", "cantidad_posterior" AS "resultingQuantity", "motivo" AS reason,\n             "ocurrido_en" AS "occurredAt"',
      )
      .execute()
      .then((result) => result.raw);
  }

  private async assertOperatingDayExistsFindJornadaOperativa(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<AssertOperatingDayExistsFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('1 AS "1"')
      .where('"id_jornada" = :dayId')
      .setParameters({ dayId: input.dayId })
      .getRawMany<AssertOperatingDayExistsFindJornadaOperativaRow>();
  }

  private async lockCurrentOperatingDayFindOperation(
    manager: EntityManager,
  ): Promise<void> {
    await this.locks.acquire(manager);
  }

  private async lockCurrentOperatingDayFindConfiguracionOperativa(
    manager: EntityManager,
  ): Promise<LockCurrentOperatingDayFindConfiguracionOperativaRow[]> {
    return manager
      .getRepository(OperationsSettings)
      .createQueryBuilder('configuracion_operativa')
      .select('"zona_horaria" AS "timeZone"')
      .where('"id_configuracion" = 1')
      .setLock('pessimistic_read', undefined, undefined)
      .getRawMany<LockCurrentOperatingDayFindConfiguracionOperativaRow>();
  }

  private async lockCurrentOperatingDayFindOperationNext(
    manager: EntityManager,
    input: { timeZone: string },
  ): Promise<LockCurrentOperatingDayFindOperationNextRow[]> {
    return manager
      .createQueryBuilder()
      .select('timezone(:timeZone, now())::date AS "businessDate"')
      .from('(SELECT 1)', '_singleton')
      .setParameters({ timeZone: input.timeZone })
      .getRawMany<LockCurrentOperatingDayFindOperationNextRow>();
  }

  private async lockCurrentOperatingDayFindJornadaOperativa(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<LockCurrentOperatingDayFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select([
        '"id_jornada" AS id',
        '"fecha_operativa" AS "businessDate"',
        '"estado" AS status',
      ])
      .where('"id_jornada" = :dayId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ dayId: input.dayId })
      .getRawMany<LockCurrentOperatingDayFindJornadaOperativaRow>();
  }

  private async lockInventoryFindInventarioDiario(
    manager: EntityManager,
    input: { dayId: string; productId: string },
  ): Promise<LockInventoryFindInventarioDiarioRow[]> {
    return manager
      .getRepository(DailyInventory)
      .createQueryBuilder('i')
      .select(
        'i."id_inventario" AS id, i."cantidad_inicial" AS "initialQuantity", i."cantidad_fisica" AS "physicalQuantity", i."cantidad_reservada" AS "reservedQuantity", p."id_producto" AS "productId", p."sku", p."nombre" AS "productName"',
      )
      .innerJoin(Product, 'p', 'p."id_producto" = i."id_producto"')
      .where('i."id_jornada" = :dayId AND i."id_producto" = :productId')
      .setLock('pessimistic_write', undefined, ['i'])
      .setParameters({ dayId: input.dayId, productId: input.productId })
      .getRawMany<LockInventoryFindInventarioDiarioRow>();
  }

  private async writeMovementUpdateInventarioDiario(
    manager: EntityManager,
    input: { id: string; nextQuantity: number },
  ): Promise<void> {
    await manager
      .getRepository(DailyInventory)
      .createQueryBuilder()
      .update(DailyInventory)
      .set({ cantidad_fisica: input.nextQuantity })
      .where('"id_inventario" = :id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async writeMovementInsertMovimientoInventario(
    manager: EntityManager,
    input: {
      id: string;
      userId: string;
      type: string;
      delta: number;
      beforeQuantity: number;
      nextQuantity: number;
      reason: string;
    },
  ): Promise<WriteMovementInsertMovimientoInventarioRow[]> {
    return manager
      .getRepository(InventoryMovement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_inventario: input.id,
          registrado_por: input.userId,
          tipo: input.type,
          delta_fisico: input.delta,
          cantidad_anterior: input.beforeQuantity,
          cantidad_posterior: input.nextQuantity,
          motivo: input.reason,
        },
      ])
      .returning(
        '"id_movimiento" AS id, "tipo" AS type, "delta_fisico" AS "physicalDelta",\n         "cantidad_anterior" AS "previousQuantity", "cantidad_posterior" AS "resultingQuantity",\n         "motivo" AS reason, "ocurrido_en" AS "occurredAt"',
      )
      .execute()
      .then((result) => result.raw);
  }

  private async idempotentFindOperation(
    manager: EntityManager,
    input: { lockKey: string },
  ): Promise<void> {
    await this.locks.acquireIdempotency(manager, [input.lockKey][0]);
  }

  private async idempotentFindIdempotencia(
    manager: EntityManager,
    input: { userId: string; operation: string; key: string },
  ): Promise<IdempotentFindIdempotenciaRow[]> {
    return manager
      .getRepository(IdempotencyRecord)
      .createQueryBuilder('idempotencia')
      .select(['"solicitud_hash" AS "requestHash"', '"respuesta" AS response'])
      .where(
        '"actor_usuario_id" = :userId AND "actor_tipo" = \'usuario\'\n           AND "operacion" = :operation AND "clave" = :key',
      )
      .setParameters({
        userId: input.userId,
        operation: input.operation,
        key: input.key,
      })
      .getRawMany<IdempotentFindIdempotenciaRow>();
  }

  private async idempotentInsertIdempotencia(
    manager: EntityManager,
    input: {
      userId: string;
      operation: string;
      key: string;
      requestHash: string;
      response: string;
      resourceType: 'inventario_diario' | 'movimiento_inventario';
      resourceId: string | null;
    },
  ): Promise<void> {
    await manager
      .getRepository(IdempotencyRecord)
      .createQueryBuilder()
      .insert()
      .values([
        {
          actor_usuario_id: input.userId,
          actor_tipo: 'usuario',
          operacion: input.operation,
          clave: input.key,
          solicitud_hash: input.requestHash,
          estado_http: 201,
          respuesta: () => ':response::jsonb',
          recurso_tipo: input.resourceType,
          recurso_id: input.resourceId,
        },
      ])
      .setParameters({ response: input.response })
      .execute();
  }

  private async queryListOperatingDays(
    manager: EntityManager,
    query: ListOperatingDaysQueryDto,
  ) {
    const { page, limit } = pageArgs(query);
    const filters: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (query.status) filters.push(`j."estado" = ${bind(query.status)}`);
    if (query.fromDate)
      filters.push(`j."fecha_operativa" >= ${bind(query.fromDate)}::date`);
    if (query.toDate)
      filters.push(`j."fecha_operativa" <= ${bind(query.toDate)}::date`);
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const queryValues1: unknown[] = values;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const count = await manager
      .getRepository(OperatingDay)
      .createQueryBuilder('j')
      .select('count(*)::int AS total')
      .where(
        (
          '' +
          String(String(where).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const offset = bind((page - 1) * limit);
    const take = bind(limit);
    const queryValues2: unknown[] = values;
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(OperatingDay)
      .createQueryBuilder('j')
      .select([
        'j."id_jornada" AS id',
        'j."fecha_operativa" AS "businessDate"',
        'j."estado" AS status',
        'j."abierta_en" AS "openedAt"',
        'j."abierta_por" AS "openedBy"',
        'c."cerrado_en" AS "closedAt"',
        'c."cerrado_por" AS "closedBy"',
        'c.id_cierre AS "closureId"',
      ])
      .leftJoin(OperatingDayClosure, 'c', 'c.id_jornada=j.id_jornada')
      .where(
        (
          '' +
          String(String(where).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .addOrderBy('j."fecha_operativa"', 'DESC')
      .addOrderBy('j."id_jornada"', 'DESC')
      .limit(Number(queryValues2[Number(String(take).replace('$', '')) - 1]))
      .offset(Number(queryValues2[Number(String(offset).replace('$', '')) - 1]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total: count[0].total, page, limit };
  }

  private async queryListInventory(
    manager: EntityManager,
    dayId: string,
    query: ListInventoryQueryDto,
  ) {
    const { page, limit } = pageArgs(query);
    const { clause, values } = this.inventoryFilters(dayId, query);
    const queryValues1: unknown[] = values;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const count = await manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select('count(*)::int AS total')
      .innerJoin(Category, 'c', 'c."id_categoria" = p."id_categoria"')
      .leftJoin(
        DailyInventory,
        'i',
        'i."id_producto" = p."id_producto" AND i."id_jornada" = :p1',
      )
      .where(
        (
          '' +
          String(String(clause).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const offset = values.length + 1;
    const take = values.length + 2;
    const queryValues2: unknown[] = [...values, (page - 1) * limit, limit];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select([
        'i."id_inventario" AS "inventoryId"',
        'jsonb_build_object(\'id\', p."id_producto", \'sku\', p."sku", \'name\', p."nombre", \'categoryId\', c."id_categoria") AS product',
        '(i."id_inventario" IS NOT NULL) AS initialized',
        'i."cantidad_inicial" AS "initialQuantity"',
        'i."cantidad_fisica" AS "physicalQuantity"',
        'i."cantidad_reservada" AS "reservedQuantity"',
        'i."cantidad_fisica" - i."cantidad_reservada" AS "availableQuantity"',
      ])
      .innerJoin(Category, 'c', 'c."id_categoria" = p."id_categoria"')
      .leftJoin(
        DailyInventory,
        'i',
        'i."id_producto" = p."id_producto" AND i."id_jornada" = :p1',
      )
      .where(
        (
          '' +
          String(String(clause).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .addOrderBy('p."orden"', 'ASC')
      .addOrderBy('p."nombre"', 'ASC')
      .addOrderBy('p."id_producto"', 'ASC')
      .limit(Number(queryValues2[Number(String(take).replace('$', '')) - 1]))
      .offset(Number(queryValues2[Number(String(offset).replace('$', '')) - 1]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total: count[0].total, page, limit };
  }

  private async queryListMovements(
    manager: EntityManager,
    dayId: string,
    query: ListInventoryMovementsQueryDto,
  ) {
    const { page, limit } = pageArgs(query);
    const values: unknown[] = [dayId];
    const filters: string[] = ['i."id_jornada" = $1'];
    if (query.productId) {
      values.push(query.productId);
      filters.push(`i."id_producto" = $${values.length}`);
    }
    if (query.type) {
      values.push(query.type);
      filters.push(`m."tipo" = $${values.length}`);
    }
    const where = `WHERE ${filters.join(' AND ')}`;
    const queryValues1: unknown[] = values;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const count = await manager
      .getRepository(InventoryMovement)
      .createQueryBuilder('m')
      .select('count(*)::int AS total')
      .innerJoin(DailyInventory, 'i', 'i."id_inventario" = m."id_inventario"')
      .where(
        (
          '' +
          String(String(where).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const offset = values.length + 1;
    const take = values.length + 2;
    const queryValues2: unknown[] = [...values, (page - 1) * limit, limit];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(InventoryMovement)
      .createQueryBuilder('m')
      .select([
        'm."id_movimiento" AS id',
        'm."tipo" AS type',
        'm."delta_fisico" AS "physicalDelta"',
        'm."cantidad_anterior" AS "previousQuantity"',
        'm."cantidad_posterior" AS "resultingQuantity"',
        'm."motivo" AS reason',
        'm."ocurrido_en" AS "occurredAt"',
        'm."registrado_por" AS "recordedBy"',
        'i."id_producto" AS "productId"',
        'p."nombre" AS "productName"',
      ])
      .innerJoin(DailyInventory, 'i', 'i."id_inventario" = m."id_inventario"')
      .innerJoin(Product, 'p', 'p."id_producto" = i."id_producto"')
      .where(
        (
          '' +
          String(String(where).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .addOrderBy('m."ocurrido_en"', 'DESC')
      .addOrderBy('m."id_movimiento"', 'DESC')
      .limit(Number(queryValues2[Number(String(take).replace('$', '')) - 1]))
      .offset(Number(queryValues2[Number(String(offset).replace('$', '')) - 1]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total: count[0].total, page, limit };
  }

  private inventoryFilters(dayId: string, query: ListInventoryQueryDto) {
    const values: unknown[] = [dayId];
    const filters = [
      '(i."id_inventario" IS NOT NULL OR (p."activo" = true AND p."controla_inventario" = true))',
    ];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (query.search?.trim()) {
      const search = query.search.trim().replace(/[\\%_]/g, '\\$&');
      const parameter = bind(`%${search}%`);
      filters.push(
        `(p."nombre" ILIKE ${parameter} ESCAPE E'\\\\' OR p."sku" ILIKE ${parameter} ESCAPE E'\\\\')`,
      );
    }
    if (query.categoryId)
      filters.push(`c."id_categoria" = ${bind(query.categoryId)}`);
    if (query.initialized !== undefined)
      filters.push(
        `(i."id_inventario" IS NOT NULL) = ${bind(query.initialized)}`,
      );
    return { clause: `WHERE ${filters.join(' AND ')}`, values };
  }
}
