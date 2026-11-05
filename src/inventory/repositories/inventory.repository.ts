import type { EntityManager } from 'typeorm';
import { OperationalLockRepository } from '../../database/repositories/operational-lock.repository.js';
import type {
  ListInventoryMovementsQueryDto,
  ListInventoryQueryDto,
  ListOperatingDaysQueryDto,
} from '../dto/list-inventory-query.dto.js';
// Read builders
const pageArgs = (query: { page: number; limit: number }) => ({
  page: query.page ?? 1,
  limit: query.limit ?? 20,
});
export interface ListOperatingDaysFindJornadaOperativaRow {
  total: number;
}
export interface ListOperatingDaysFindJornadaOperativaNextRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
  closedAt: Date | null;
  closedBy: string | null;
  closureId: string | null;
}
export interface ListInventoryFindProductoRow {
  total: number;
}
export interface ListInventoryFindProductoNextRow {
  inventoryId: string;
  product: { id: string; sku: string; name: string; categoryId: string };
  initialized: boolean;
  initialQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: string;
}
export interface GetInventoryItemFindProductoRow {
  inventoryId: string;
  product: { id: string; sku: string; name: string; categoryId: string };
  initialized: boolean;
  initialQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}
export interface ListMovementsFindMovimientoInventarioRow {
  total: number;
}
export interface ListMovementsFindMovimientoInventarioNextRow {
  id: string;
  type: string;
  physicalDelta: number;
  previousQuantity: number;
  resultingQuantity: number;
  reason: string;
  occurredAt: Date;
  recordedBy: string;
  productId: string;
  productName: string;
}
export interface InitializeFindProductoRow {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
}
export interface InitializeFindInventarioDiarioRow {
  '1': string;
}
export interface InitializeInsertInventarioDiarioRow {
  inventoryId: string;
  initialQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
}
export interface InitializeInsertMovimientoInventarioRow {
  id: string;
  type: string;
  physicalDelta: number;
  previousQuantity: number;
  resultingQuantity: number;
  reason: string;
  occurredAt: Date;
}
export interface AssertOperatingDayExistsFindJornadaOperativaRow {
  '1': string;
}
export interface LockCurrentOperatingDayFindConfiguracionOperativaRow {
  timeZone: string;
}
export interface LockCurrentOperatingDayFindOperationNextRow {
  businessDate: string;
}
export interface LockCurrentOperatingDayFindJornadaOperativaRow {
  id: string;
  businessDate: string;
  status: string;
}
export interface LockInventoryFindInventarioDiarioRow {
  id: string;
  initialQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
  productId: string;
  sku: string;
  productName: string;
}
export interface WriteMovementInsertMovimientoInventarioRow {
  id: string;
  type: string;
  physicalDelta: number;
  previousQuantity: number;
  resultingQuantity: number;
  reason: string;
  occurredAt: Date;
}
export interface IdempotentFindIdempotenciaRow {
  requestHash: string;
  response: unknown;
}
export class InventoryRepository {
  private async listOperatingDaysFindJornadaOperativa(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListOperatingDaysFindJornadaOperativaRow[]> {
    return manager.query<ListOperatingDaysFindJornadaOperativaRow[]>(
      `SELECT count(*)::int AS total FROM "jornada_operativa" j ${fragment0}`,
      parameters,
    );
  }
  private async listOperatingDaysFindJornadaOperativaNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
    fragment2: unknown,
  ): Promise<ListOperatingDaysFindJornadaOperativaNextRow[]> {
    return manager.query<ListOperatingDaysFindJornadaOperativaNextRow[]>(
      `SELECT j."id_jornada" AS id, j."fecha_operativa" AS "businessDate", j."estado" AS status,
          j."abierta_en" AS "openedAt", j."abierta_por" AS "openedBy",
          c."cerrado_en" AS "closedAt",c."cerrado_por" AS "closedBy",c.id_cierre AS "closureId"
       FROM "jornada_operativa" j LEFT JOIN cierre_jornada c ON c.id_jornada=j.id_jornada ${fragment0}
       ORDER BY j."fecha_operativa" DESC, j."id_jornada" DESC
       OFFSET ${fragment1} LIMIT ${fragment2}`,
      parameters,
    );
  }
  private async listInventoryFindProducto(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListInventoryFindProductoRow[]> {
    return manager.query<ListInventoryFindProductoRow[]>(
      `SELECT count(*)::int AS total FROM "producto" p
       JOIN "categoria" c ON c."id_categoria" = p."id_categoria"
       LEFT JOIN "inventario_diario" i ON i."id_producto" = p."id_producto" AND i."id_jornada" = $1
       ${fragment0}`,
      parameters,
    );
  }
  private async listInventoryFindProductoNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
    fragment2: unknown,
  ): Promise<ListInventoryFindProductoNextRow[]> {
    return manager.query<ListInventoryFindProductoNextRow[]>(
      `SELECT i."id_inventario" AS "inventoryId",
          jsonb_build_object('id', p."id_producto", 'sku', p."sku", 'name', p."nombre", 'categoryId', c."id_categoria") AS product,
          (i."id_inventario" IS NOT NULL) AS initialized,
          i."cantidad_inicial" AS "initialQuantity", i."cantidad_fisica" AS "physicalQuantity",
          i."cantidad_reservada" AS "reservedQuantity",
          i."cantidad_fisica" - i."cantidad_reservada" AS "availableQuantity"
       FROM "producto" p JOIN "categoria" c ON c."id_categoria" = p."id_categoria"
       LEFT JOIN "inventario_diario" i ON i."id_producto" = p."id_producto" AND i."id_jornada" = $1
       ${fragment0}
       ORDER BY p."orden", p."nombre", p."id_producto" OFFSET $${fragment1} LIMIT $${fragment2}`,
      parameters,
    );
  }
  async getInventoryItemFindProducto(
    manager: EntityManager,
    input: { dayId: string; productId: string },
  ): Promise<GetInventoryItemFindProductoRow[]> {
    return manager.query<GetInventoryItemFindProductoRow[]>(
      `SELECT i."id_inventario" AS "inventoryId",
          jsonb_build_object('id', p."id_producto", 'sku', p."sku", 'name', p."nombre", 'categoryId', c."id_categoria") AS product,
          (i."id_inventario" IS NOT NULL) AS initialized,
          i."cantidad_inicial" AS "initialQuantity", i."cantidad_fisica" AS "physicalQuantity",
          i."cantidad_reservada" AS "reservedQuantity",
          i."cantidad_fisica" - i."cantidad_reservada" AS "availableQuantity"
       FROM "producto" p JOIN "categoria" c ON c."id_categoria" = p."id_categoria"
       LEFT JOIN "inventario_diario" i ON i."id_producto" = p."id_producto" AND i."id_jornada" = $1
       WHERE p."id_producto" = $2 AND (i."id_inventario" IS NOT NULL OR (p."activo" = true AND p."controla_inventario" = true))`,
      [input.dayId, input.productId],
    );
  }
  private async listMovementsFindMovimientoInventario(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListMovementsFindMovimientoInventarioRow[]> {
    return manager.query<ListMovementsFindMovimientoInventarioRow[]>(
      `SELECT count(*)::int AS total FROM "movimiento_inventario" m
       JOIN "inventario_diario" i ON i."id_inventario" = m."id_inventario" ${fragment0}`,
      parameters,
    );
  }
  private async listMovementsFindMovimientoInventarioNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
    fragment2: unknown,
  ): Promise<ListMovementsFindMovimientoInventarioNextRow[]> {
    return manager.query<ListMovementsFindMovimientoInventarioNextRow[]>(
      `SELECT m."id_movimiento" AS id, m."tipo" AS type, m."delta_fisico" AS "physicalDelta",
          m."cantidad_anterior" AS "previousQuantity", m."cantidad_posterior" AS "resultingQuantity",
          m."motivo" AS reason, m."ocurrido_en" AS "occurredAt", m."registrado_por" AS "recordedBy",
          i."id_producto" AS "productId", p."nombre" AS "productName"
       FROM "movimiento_inventario" m
       JOIN "inventario_diario" i ON i."id_inventario" = m."id_inventario"
       JOIN "producto" p ON p."id_producto" = i."id_producto" ${fragment0}
       ORDER BY m."ocurrido_en" DESC, m."id_movimiento" DESC OFFSET $${fragment1} LIMIT $${fragment2}`,
      parameters,
    );
  }
  async initializeFindProducto(
    manager: EntityManager,
    input: { sortedIds: string[] },
  ): Promise<InitializeFindProductoRow[]> {
    return manager.query<InitializeFindProductoRow[]>(
      `SELECT p."id_producto" AS id, p."sku", p."nombre" AS name, c."id_categoria" AS "categoryId"
         FROM "producto" p JOIN "categoria" c ON c."id_categoria" = p."id_categoria"
         WHERE p."id_producto" = ANY($1::uuid[]) AND p."activo" = true AND p."controla_inventario" = true
         ORDER BY p."id_producto" FOR UPDATE OF p`,
      [input.sortedIds],
    );
  }
  async initializeFindInventarioDiario(
    manager: EntityManager,
    input: { dayId: string; productId: string },
  ): Promise<InitializeFindInventarioDiarioRow[]> {
    return manager.query<InitializeFindInventarioDiarioRow[]>(
      'SELECT 1 FROM "inventario_diario" WHERE "id_jornada" = $1 AND "id_producto" = $2',
      [input.dayId, input.productId],
    );
  }
  async initializeInsertInventarioDiario(
    manager: EntityManager,
    input: {
      dayId: string;
      productId: string;
      initialQuantity: number;
      userId: string;
    },
  ): Promise<InitializeInsertInventarioDiarioRow[]> {
    return manager.query<InitializeInsertInventarioDiarioRow[]>(
      `INSERT INTO "inventario_diario" ("id_jornada", "id_producto", "cantidad_inicial", "cantidad_fisica", "cantidad_reservada", "inicializado_por")
           VALUES ($1, $2, $3, $3, 0, $4)
           RETURNING "id_inventario" AS "inventoryId", "cantidad_inicial" AS "initialQuantity",
             "cantidad_fisica" AS "physicalQuantity", "cantidad_reservada" AS "reservedQuantity"`,
      [input.dayId, input.productId, input.initialQuantity, input.userId],
    );
  }
  async initializeInsertMovimientoInventario(
    manager: EntityManager,
    input: { inventoryId: string; userId: string; initialQuantity: number },
  ): Promise<InitializeInsertMovimientoInventarioRow[]> {
    return manager.query<InitializeInsertMovimientoInventarioRow[]>(
      `INSERT INTO "movimiento_inventario" ("id_inventario", "registrado_por", "tipo", "delta_fisico", "cantidad_anterior", "cantidad_posterior", "motivo")
           VALUES ($1, $2, 'initialization', $3, 0, $3, 'Inicialización de inventario diario')
           RETURNING "id_movimiento" AS id, "tipo" AS type, "delta_fisico" AS "physicalDelta",
             "cantidad_anterior" AS "previousQuantity", "cantidad_posterior" AS "resultingQuantity", "motivo" AS reason,
             "ocurrido_en" AS "occurredAt"`,
      [input.inventoryId, input.userId, input.initialQuantity],
    );
  }
  async assertOperatingDayExistsFindJornadaOperativa(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<AssertOperatingDayExistsFindJornadaOperativaRow[]> {
    return manager.query<AssertOperatingDayExistsFindJornadaOperativaRow[]>(
      'SELECT 1 FROM "jornada_operativa" WHERE "id_jornada" = $1',
      [input.dayId],
    );
  }
  async lockCurrentOperatingDayFindOperation(
    manager: EntityManager,
  ): Promise<void> {
    await new OperationalLockRepository().acquire(manager);
  }
  async lockCurrentOperatingDayFindConfiguracionOperativa(
    manager: EntityManager,
  ): Promise<LockCurrentOperatingDayFindConfiguracionOperativaRow[]> {
    return manager.query<
      LockCurrentOperatingDayFindConfiguracionOperativaRow[]
    >(
      'SELECT "zona_horaria" AS "timeZone" FROM "configuracion_operativa" WHERE "id_configuracion" = 1 FOR SHARE',
      [],
    );
  }
  async lockCurrentOperatingDayFindOperationNext(
    manager: EntityManager,
    input: { timeZone: string },
  ): Promise<LockCurrentOperatingDayFindOperationNextRow[]> {
    return manager.query<LockCurrentOperatingDayFindOperationNextRow[]>(
      'SELECT timezone($1, now())::date AS "businessDate"',
      [input.timeZone],
    );
  }
  async lockCurrentOperatingDayFindJornadaOperativa(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<LockCurrentOperatingDayFindJornadaOperativaRow[]> {
    return manager.query<LockCurrentOperatingDayFindJornadaOperativaRow[]>(
      `SELECT "id_jornada" AS id, "fecha_operativa" AS "businessDate", "estado" AS status
       FROM "jornada_operativa" WHERE "id_jornada" = $1 FOR UPDATE`,
      [input.dayId],
    );
  }
  async lockInventoryFindInventarioDiario(
    manager: EntityManager,
    input: { dayId: string; productId: string },
  ): Promise<LockInventoryFindInventarioDiarioRow[]> {
    return manager.query<LockInventoryFindInventarioDiarioRow[]>(
      `SELECT i."id_inventario" AS id, i."cantidad_inicial" AS "initialQuantity",
          i."cantidad_fisica" AS "physicalQuantity", i."cantidad_reservada" AS "reservedQuantity",
          p."id_producto" AS "productId", p."sku", p."nombre" AS "productName"
       FROM "inventario_diario" i JOIN "producto" p ON p."id_producto" = i."id_producto"
       WHERE i."id_jornada" = $1 AND i."id_producto" = $2 FOR UPDATE OF i`,
      [input.dayId, input.productId],
    );
  }
  async writeMovementUpdateInventarioDiario(
    manager: EntityManager,
    input: { id: string; nextQuantity: number },
  ): Promise<void> {
    await manager.query(
      'UPDATE "inventario_diario" SET "cantidad_fisica" = $2 WHERE "id_inventario" = $1',
      [input.id, input.nextQuantity],
    );
  }
  async writeMovementInsertMovimientoInventario(
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
    return manager.query<WriteMovementInsertMovimientoInventarioRow[]>(
      `INSERT INTO "movimiento_inventario" ("id_inventario", "registrado_por", "tipo", "delta_fisico", "cantidad_anterior", "cantidad_posterior", "motivo")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING "id_movimiento" AS id, "tipo" AS type, "delta_fisico" AS "physicalDelta",
         "cantidad_anterior" AS "previousQuantity", "cantidad_posterior" AS "resultingQuantity",
         "motivo" AS reason, "ocurrido_en" AS "occurredAt"`,
      [
        input.id,
        input.userId,
        input.type,
        input.delta,
        input.beforeQuantity,
        input.nextQuantity,
        input.reason,
      ],
    );
  }
  async idempotentFindOperation(
    manager: EntityManager,
    input: { lockKey: string },
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 71920405))',
      [input.lockKey],
    );
  }
  async idempotentFindIdempotencia(
    manager: EntityManager,
    input: { userId: string; operation: string; key: string },
  ): Promise<IdempotentFindIdempotenciaRow[]> {
    return manager.query<IdempotentFindIdempotenciaRow[]>(
      `SELECT "solicitud_hash" AS "requestHash", "respuesta" AS response
         FROM "idempotencia" WHERE "actor_usuario_id" = $1 AND "actor_tipo" = 'usuario'
           AND "operacion" = $2 AND "clave" = $3`,
      [input.userId, input.operation, input.key],
    );
  }
  async idempotentInsertIdempotencia(
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
    await manager.query(
      `INSERT INTO "idempotencia" ("actor_usuario_id", "actor_tipo", "operacion", "clave", "solicitud_hash", "estado_http", "respuesta", "recurso_tipo", "recurso_id")
         VALUES ($1, 'usuario', $2, $3, $4, 201, $5::jsonb, $6, $7)`,
      [
        input.userId,
        input.operation,
        input.key,
        input.requestHash,
        input.response,
        input.resourceType,
        input.resourceId,
      ],
    );
  }

  async listOperatingDays(
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
    const count = await this.listOperatingDaysFindJornadaOperativa(
      manager,
      values,
      where,
    );
    const offset = bind((page - 1) * limit);
    const take = bind(limit);
    const items = await this.listOperatingDaysFindJornadaOperativaNext(
      manager,
      values,
      where,
      offset,
      take,
    );
    return { items, total: count[0].total, page, limit };
  }

  async listInventory(
    manager: EntityManager,
    dayId: string,
    query: ListInventoryQueryDto,
  ) {
    const { page, limit } = pageArgs(query);
    const { clause, values } = this.inventoryFilters(dayId, query);
    const count = await this.listInventoryFindProducto(manager, values, clause);
    const offset = values.length + 1;
    const take = values.length + 2;
    const items = await this.listInventoryFindProductoNext(
      manager,
      [...values, (page - 1) * limit, limit],
      clause,
      offset,
      take,
    );
    return { items, total: count[0].total, page, limit };
  }

  async listMovements(
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
    const count = await this.listMovementsFindMovimientoInventario(
      manager,
      values,
      where,
    );
    const offset = values.length + 1;
    const take = values.length + 2;
    const items = await this.listMovementsFindMovimientoInventarioNext(
      manager,
      [...values, (page - 1) * limit, limit],
      where,
      offset,
      take,
    );
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
