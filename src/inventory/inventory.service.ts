import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import type { InitializeInventoryDto } from './dto/initialize-inventory.dto.js';
import type { ListInventoryMovementsQueryDto, ListInventoryQueryDto, ListOperatingDaysQueryDto } from './dto/list-inventory-query.dto.js';
import type { CreateInventoryAdjustmentDto, CreateInventoryMovementDto } from './dto/inventory-movement.dto.js';

const maxInteger = 2_147_483_647;
const validMovementTypes = new Set(['initialization', 'restock', 'internalConsumption', 'giveaway', 'waste', 'adjustment']);
const pageArgs = (query: { page: number; limit: number }) => ({ page: query.page ?? 1, limit: query.limit ?? 20 });

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
  constructor(private readonly dataSource: DataSource) {}

  async listOperatingDays(query: ListOperatingDaysQueryDto) {
    this.validateDayFilters(query);
    const { page, limit } = pageArgs(query);
    const filters: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (query.status) filters.push(`j."estado" = ${bind(query.status)}`);
    if (query.fromDate) filters.push(`j."fecha_operativa" >= ${bind(query.fromDate)}::date`);
    if (query.toDate) filters.push(`j."fecha_operativa" <= ${bind(query.toDate)}::date`);
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const count = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM "jornada_operativa" j ${where}`,
      values,
    );
    const offset = bind((page - 1) * limit);
    const take = bind(limit);
    const items = await this.dataSource.query(
      `SELECT j."id_jornada" AS id, j."fecha_operativa" AS "businessDate", j."estado" AS status,
          j."abierta_en" AS "openedAt", j."abierta_por" AS "openedBy"
       FROM "jornada_operativa" j ${where}
       ORDER BY j."fecha_operativa" DESC, j."id_jornada" DESC
       OFFSET ${offset} LIMIT ${take}`,
      values,
    );
    return { items, total: count[0].total, page, limit };
  }

  async listInventory(dayId: string, query: ListInventoryQueryDto) {
    await this.assertOperatingDayExists(dayId);
    const { page, limit } = pageArgs(query);
    const { clause, values } = this.inventoryFilters(dayId, query);
    const count = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM "producto" p
       JOIN "categoria" c ON c."id_categoria" = p."id_categoria"
       LEFT JOIN "inventario_diario" i ON i."id_producto" = p."id_producto" AND i."id_jornada" = $1
       ${clause}`,
      values,
    );
    const offset = values.length + 1;
    const take = values.length + 2;
    const items = await this.dataSource.query(
      `SELECT i."id_inventario" AS "inventoryId",
          jsonb_build_object('id', p."id_producto", 'sku', p."sku", 'name', p."nombre", 'categoryId', c."id_categoria") AS product,
          (i."id_inventario" IS NOT NULL) AS initialized,
          i."cantidad_inicial" AS "initialQuantity", i."cantidad_fisica" AS "physicalQuantity",
          i."cantidad_reservada" AS "reservedQuantity",
          i."cantidad_fisica" - i."cantidad_reservada" AS "availableQuantity"
       FROM "producto" p JOIN "categoria" c ON c."id_categoria" = p."id_categoria"
       LEFT JOIN "inventario_diario" i ON i."id_producto" = p."id_producto" AND i."id_jornada" = $1
       ${clause}
       ORDER BY p."orden", p."nombre", p."id_producto" OFFSET $${offset} LIMIT $${take}`,
      [...values, (page - 1) * limit, limit],
    );
    return { items, total: count[0].total, page, limit };
  }

  async getInventoryItem(dayId: string, productId: string): Promise<InventoryItem> {
    await this.assertOperatingDayExists(dayId);
    const rows = await this.dataSource.query(
      `SELECT i."id_inventario" AS "inventoryId",
          jsonb_build_object('id', p."id_producto", 'sku', p."sku", 'name', p."nombre", 'categoryId', c."id_categoria") AS product,
          (i."id_inventario" IS NOT NULL) AS initialized,
          i."cantidad_inicial" AS "initialQuantity", i."cantidad_fisica" AS "physicalQuantity",
          i."cantidad_reservada" AS "reservedQuantity",
          i."cantidad_fisica" - i."cantidad_reservada" AS "availableQuantity"
       FROM "producto" p JOIN "categoria" c ON c."id_categoria" = p."id_categoria"
       LEFT JOIN "inventario_diario" i ON i."id_producto" = p."id_producto" AND i."id_jornada" = $1
       WHERE p."id_producto" = $2 AND (i."id_inventario" IS NOT NULL OR (p."activo" = true AND p."controla_inventario" = true))`,
      [dayId, productId],
    );
    if (!rows[0]) throw new NotFoundException('Producto no encontrado en el inventario de esa jornada.');
    return rows[0] as InventoryItem;
  }

  async listMovements(dayId: string, query: ListInventoryMovementsQueryDto) {
    await this.assertOperatingDayExists(dayId);
    this.validateMovementFilter(query.type);
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
    const count = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM "movimiento_inventario" m
       JOIN "inventario_diario" i ON i."id_inventario" = m."id_inventario" ${where}`,
      values,
    );
    const offset = values.length + 1;
    const take = values.length + 2;
    const items = await this.dataSource.query(
      `SELECT m."id_movimiento" AS id, m."tipo" AS type, m."delta_fisico" AS "physicalDelta",
          m."cantidad_anterior" AS "previousQuantity", m."cantidad_posterior" AS "resultingQuantity",
          m."motivo" AS reason, m."ocurrido_en" AS "occurredAt", m."registrado_por" AS "recordedBy",
          i."id_producto" AS "productId", p."nombre" AS "productName"
       FROM "movimiento_inventario" m
       JOIN "inventario_diario" i ON i."id_inventario" = m."id_inventario"
       JOIN "producto" p ON p."id_producto" = i."id_producto" ${where}
       ORDER BY m."ocurrido_en" DESC, m."id_movimiento" DESC OFFSET $${offset} LIMIT $${take}`,
      [...values, (page - 1) * limit, limit],
    );
    return { items, total: count[0].total, page, limit };
  }

  async initialize(
    dayId: string,
    dto: InitializeInventoryDto,
    idempotencyKey: string | undefined,
    actor: AuthenticatedRequestContext,
  ) {
    const normalizedItems = dto.items.map((item) => ({ ...item, productId: item.productId.toLowerCase() }));
    const normalizedDto = { items: normalizedItems };
    const operation = `POST:/admin/operating-days/${dayId.toLowerCase()}/inventory/initialize`;
    return this.idempotent(operation, idempotencyKey, normalizedDto, actor, async (manager) => {
      await this.lockCurrentOperatingDay(manager, dayId);
      const ids = normalizedItems.map((item) => item.productId);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('No repitas productos en el lote.');
      const sortedIds = [...ids].sort((a, b) => a.localeCompare(b, 'en'));
      const products = await manager.query(
        `SELECT p."id_producto" AS id, p."sku", p."nombre" AS name, c."id_categoria" AS "categoryId"
         FROM "producto" p JOIN "categoria" c ON c."id_categoria" = p."id_categoria"
         WHERE p."id_producto" = ANY($1::uuid[]) AND p."activo" = true AND p."controla_inventario" = true
         ORDER BY p."id_producto" FOR UPDATE OF p`,
        [sortedIds],
      );
      if (products.length !== ids.length) {
        throw new BadRequestException('Todos los productos deben existir, estar activos y controlar inventario.');
      }
      const productById = new Map(products.map((product: { id: string }) => [product.id, product]));
      const result: InventoryItem[] = [];
      for (const item of normalizedItems) {
        const product = productById.get(item.productId);
        const existing = await manager.query(
          'SELECT 1 FROM "inventario_diario" WHERE "id_jornada" = $1 AND "id_producto" = $2',
          [dayId, item.productId],
        );
        if (existing[0]) throw new ConflictException(`El producto ${item.productId} ya está inicializado en esta jornada.`);
        const inserted = await manager.query(
          `INSERT INTO "inventario_diario" ("id_jornada", "id_producto", "cantidad_inicial", "cantidad_fisica", "cantidad_reservada", "inicializado_por")
           VALUES ($1, $2, $3, $3, 0, $4)
           RETURNING "id_inventario" AS "inventoryId", "cantidad_inicial" AS "initialQuantity",
             "cantidad_fisica" AS "physicalQuantity", "cantidad_reservada" AS "reservedQuantity"`,
          [dayId, item.productId, item.initialQuantity, actor.userId],
        );
        const inventory = inserted[0];
        const movement = await manager.query(
          `INSERT INTO "movimiento_inventario" ("id_inventario", "registrado_por", "tipo", "delta_fisico", "cantidad_anterior", "cantidad_posterior", "motivo")
           VALUES ($1, $2, 'initialization', $3, 0, $3, 'Inicialización de inventario diario')
           RETURNING "id_movimiento" AS id, "tipo" AS type, "delta_fisico" AS "physicalDelta",
             "cantidad_anterior" AS "previousQuantity", "cantidad_posterior" AS "resultingQuantity", "motivo" AS reason,
             "ocurrido_en" AS "occurredAt"`,
          [inventory.inventoryId, actor.userId, item.initialQuantity],
        );
        const response: InventoryItem = {
          inventoryId: inventory.inventoryId,
          product: product as InventoryItem['product'],
          initialized: true,
          initialQuantity: inventory.initialQuantity,
          physicalQuantity: inventory.physicalQuantity,
          reservedQuantity: inventory.reservedQuantity,
          availableQuantity: inventory.physicalQuantity - inventory.reservedQuantity,
        };
        await this.audit(manager, actor, 'inventario_diario', inventory.inventoryId, 'inventory.initialized', {}, {
          inventory: response,
          movement: movement[0],
        });
        result.push(response);
      }
      return { items: result };
    });
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
    return this.idempotent(operation, idempotencyKey, normalizedDto, actor, async (manager) => {
      await this.lockCurrentOperatingDay(manager, dayId);
      const { inventory, product } = await this.lockInventory(manager, dayId, productId);
      const reason = normalizedDto.reason;
      const delta = dto.type === 'restock' ? dto.quantity : -dto.quantity;
      const result = await this.writeMovement(manager, actor, inventory, product, dto.type, delta, reason);
      await this.audit(manager, actor, 'inventario_diario', inventory.id, `inventory.${dto.type}`, result.before, result.after);
      return result.after;
    });
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
    return this.idempotent(operation, idempotencyKey, normalizedDto, actor, async (manager) => {
      await this.lockCurrentOperatingDay(manager, dayId);
      const { inventory, product } = await this.lockInventory(manager, dayId, productId);
      const reason = normalizedDto.reason;
      const delta = dto.countedQuantity - inventory.physicalQuantity;
      if (delta === 0) throw new BadRequestException('El conteo coincide con la existencia actual; no hay ajuste que registrar.');
      if (dto.countedQuantity < inventory.reservedQuantity) {
        throw new ConflictException('El conteo no puede ser inferior a las unidades reservadas.');
      }
      const result = await this.writeMovement(manager, actor, inventory, product, 'adjustment', delta, reason, dto.countedQuantity);
      await this.audit(manager, actor, 'inventario_diario', inventory.id, 'inventory.adjustment', result.before, result.after);
      return result.after;
    });
  }

  private inventoryFilters(dayId: string, query: ListInventoryQueryDto) {
    const values: unknown[] = [dayId];
    const filters = ['(i."id_inventario" IS NOT NULL OR (p."activo" = true AND p."controla_inventario" = true))'];
    const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (query.search?.trim()) {
      const search = query.search.trim().replace(/[\\%_]/g, '\\$&');
      const parameter = bind(`%${search}%`);
      filters.push(`(p."nombre" ILIKE ${parameter} ESCAPE E'\\\\' OR p."sku" ILIKE ${parameter} ESCAPE E'\\\\')`);
    }
    if (query.categoryId) filters.push(`c."id_categoria" = ${bind(query.categoryId)}`);
    if (query.initialized !== undefined) filters.push(`(i."id_inventario" IS NOT NULL) = ${bind(query.initialized)}`);
    return { clause: `WHERE ${filters.join(' AND ')}`, values };
  }

  private validateDayFilters(query: ListOperatingDaysQueryDto) {
    if (query.status && !['open', 'closed'].includes(query.status)) throw new BadRequestException('El estado debe ser open o closed.');
    for (const date of [query.fromDate, query.toDate]) {
      if (date !== undefined && !this.isCalendarDate(date)) throw new BadRequestException('Las fechas deben ser fechas válidas con formato YYYY-MM-DD.');
    }
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) throw new BadRequestException('fromDate no puede ser posterior a toDate.');
  }

  private async assertOperatingDayExists(dayId: string) {
    const rows = await this.dataSource.query(
      'SELECT 1 FROM "jornada_operativa" WHERE "id_jornada" = $1',
      [dayId],
    );
    if (!rows[0]) throw new NotFoundException('Jornada no encontrada.');
  }

  private isCalendarDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }

  private validateMovementFilter(type?: string) {
    if (type && !validMovementTypes.has(type)) throw new BadRequestException('El tipo de movimiento no es válido.');
  }

  private async lockCurrentOperatingDay(manager: EntityManager, dayId: string) {
    await manager.query('SELECT pg_advisory_xact_lock(71920405)');
    const settings = await manager.query(
      'SELECT "zona_horaria" AS "timeZone" FROM "configuracion_operativa" WHERE "id_configuracion" = 1 FOR SHARE',
    );
    if (!settings[0]) throw new ConflictException('No existe configuración operativa.');
    const dates = await manager.query('SELECT timezone($1, now())::date AS "businessDate"', [settings[0].timeZone]);
    const days = await manager.query(
      `SELECT "id_jornada" AS id, "fecha_operativa" AS "businessDate", "estado" AS status
       FROM "jornada_operativa" WHERE "id_jornada" = $1 FOR UPDATE`,
      [dayId],
    );
    if (!days[0]) throw new NotFoundException('Jornada no encontrada.');
    if (days[0].status !== 'open' || this.dateString(days[0].businessDate) !== this.dateString(dates[0].businessDate)) {
      throw new ConflictException('Solo se puede modificar el inventario de la jornada abierta de la fecha operativa actual.');
    }
    return days[0];
  }

  private async lockInventory(manager: EntityManager, dayId: string, productId: string) {
    const rows = await manager.query(
      `SELECT i."id_inventario" AS id, i."cantidad_inicial" AS "initialQuantity",
          i."cantidad_fisica" AS "physicalQuantity", i."cantidad_reservada" AS "reservedQuantity",
          p."id_producto" AS "productId", p."sku", p."nombre" AS "productName"
       FROM "inventario_diario" i JOIN "producto" p ON p."id_producto" = i."id_producto"
       WHERE i."id_jornada" = $1 AND i."id_producto" = $2 FOR UPDATE OF i`,
      [dayId, productId],
    );
    if (!rows[0]) throw new NotFoundException('El producto no está inicializado en esta jornada.');
    return { inventory: rows[0], product: rows[0] };
  }

  private async writeMovement(
    manager: EntityManager,
    actor: AuthenticatedRequestContext,
    inventory: { id: string; initialQuantity: number; physicalQuantity: number; reservedQuantity: number },
    product: { productId: string; sku: string; productName: string },
    type: string,
    delta: number,
    reason: string,
    countedQuantity?: number,
  ) {
    const beforeQuantity = Number(inventory.physicalQuantity);
    const nextQuantity = countedQuantity ?? beforeQuantity + delta;
    if (!Number.isSafeInteger(nextQuantity) || nextQuantity < inventory.reservedQuantity || nextQuantity > maxInteger) {
      throw new ConflictException('El movimiento dejaría un saldo inválido o inferior a las unidades reservadas.');
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
    await manager.query(
      'UPDATE "inventario_diario" SET "cantidad_fisica" = $2 WHERE "id_inventario" = $1',
      [inventory.id, nextQuantity],
    );
    const rows = await manager.query(
      `INSERT INTO "movimiento_inventario" ("id_inventario", "registrado_por", "tipo", "delta_fisico", "cantidad_anterior", "cantidad_posterior", "motivo")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING "id_movimiento" AS id, "tipo" AS type, "delta_fisico" AS "physicalDelta",
         "cantidad_anterior" AS "previousQuantity", "cantidad_posterior" AS "resultingQuantity",
         "motivo" AS reason, "ocurrido_en" AS "occurredAt"`,
      [inventory.id, actor.userId, type, delta, beforeQuantity, nextQuantity, reason],
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
      throw new BadRequestException('Envía Idempotency-Key con entre 1 y 128 caracteres, sin espacios externos.');
    }
    const requestHash = createHash('sha256').update(this.canonicalJson(request)).digest('hex');
    const lockKey = `${actor.userId}:${operation}:${key}`;
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 71920405))', [lockKey]);
      const existing = await manager.query(
        `SELECT "solicitud_hash" AS "requestHash", "respuesta" AS response
         FROM "idempotencia" WHERE "actor_usuario_id" = $1 AND "actor_tipo" = 'usuario'
           AND "operacion" = $2 AND "clave" = $3`,
        [actor.userId, operation, key],
      );
      if (existing[0]) {
        if (existing[0].requestHash !== requestHash) throw new ConflictException('Idempotency-Key ya fue usada con otro contenido.');
        return existing[0].response as T;
      }
      const response = await action(manager);
      const resourceType = operation.includes('/initialize') ? 'inventario_diario' : 'movimiento_inventario';
      const resourceId = operation.includes('/initialize')
        ? (response as { items?: InventoryItem[] }).items?.[0]?.inventoryId ?? null
        : (response as { movement?: { id: string } }).movement?.id ?? null;
      await manager.query(
        `INSERT INTO "idempotencia" ("actor_usuario_id", "actor_tipo", "operacion", "clave", "solicitud_hash", "estado_http", "respuesta", "recurso_tipo", "recurso_id")
         VALUES ($1, 'usuario', $2, $3, $4, 201, $5::jsonb, $6, $7)`,
        [actor.userId, operation, key, requestHash, JSON.stringify(response), resourceType, resourceId],
      );
      return response;
    });
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
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
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
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
    await manager.query(
      `INSERT INTO "auditoria" ("actor_usuario_id", "actor_tipo", "recurso_tipo", "recurso_id", "evento", "detalle")
       VALUES ($1, 'usuario', $2, $3, $4, $5::jsonb)`,
      [actor.userId, resourceType, resourceId, event, JSON.stringify({ before, after })],
    );
  }

}
