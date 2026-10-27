import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InventoryService } from './inventory.service.js';

describe('InventoryService', () => {
  const query = vi.fn();
  const managerQuery = vi.fn();
  const actor = { userId: '11111111-1111-4111-8111-111111111111', sessionId: 'session-id' };
  const dayId = '22222222-2222-4222-8222-222222222222';
  const productId = '33333333-3333-4333-8333-333333333333';
  const inventoryId = '44444444-4444-4444-8444-444444444444';
  const movementId = '55555555-5555-4555-8555-555555555555';
  let service: InventoryService;

  beforeEach(() => {
    vi.resetAllMocks();
    const dataSource = {
      query,
      transaction: vi.fn((action: (manager: { query: typeof managerQuery }) => unknown) =>
        action({ query: managerQuery })),
    };
    service = new InventoryService(dataSource as unknown as DataSource);
    query.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('returns a stored response when an idempotency key is repeated with the same body', async () => {
    const body = { type: 'waste', quantity: 2, reason: 'Scrap' };
    const requestHash = createHash('sha256')
      .update('{"quantity":2,"reason":"Scrap","type":"waste"}')
      .digest('hex');
    const storedResponse = { inventoryId, physicalQuantity: 3 };
    managerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "idempotencia"')) return [{ requestHash, response: storedResponse }];
      return [];
    });

    await expect(service.createMovement(dayId, productId, body, 'retry-1', actor))
      .resolves.toEqual(storedResponse);
    expect(managerQuery).toHaveBeenCalledTimes(2);
  });

  it('rejects reusing an idempotency key with different content before writing inventory', async () => {
    managerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "idempotencia"')) return [{ requestHash: 'different', response: {} }];
      return [];
    });

    await expect(service.createMovement(
      dayId,
      productId,
      { type: 'waste', quantity: 2, reason: 'Scrap' },
      'retry-1',
      actor,
    )).rejects.toBeInstanceOf(ConflictException);
    expect(managerQuery).toHaveBeenCalledTimes(2);
  });

  it('requires an idempotency key for inventory writes', async () => {
    await expect(service.adjust(
      dayId,
      productId,
      { countedQuantity: 2, reason: 'Physical count' },
      undefined,
      actor,
    )).rejects.toThrow('Idempotency-Key');
  });

  it('rejects adjustments that leave fewer units than reserved', async () => {
    const now = new Date().toISOString().slice(0, 10);
    managerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "idempotencia"')) return [];
      if (sql.includes('FROM "configuracion_operativa"')) return [{ timeZone: 'America/Guayaquil' }];
      if (sql.includes('timezone($1, now())::date')) return [{ businessDate: now }];
      if (sql.includes('FROM "jornada_operativa"')) return [{ id: dayId, businessDate: now, status: 'open' }];
      if (sql.includes('FROM "inventario_diario" i JOIN "producto"')) return [{
        id: inventoryId,
        initialQuantity: 10,
        physicalQuantity: 10,
        reservedQuantity: 4,
        productId,
        sku: 'sample',
        productName: 'Sample product',
      }];
      return [];
    });

    await expect(service.adjust(
      dayId,
      productId,
      { countedQuantity: 3, reason: 'Physical count' },
      'adjust-1',
      actor,
    )).rejects.toBeInstanceOf(ConflictException);
    expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE "inventario_diario"'))).toBe(false);
  });

  it('rejects writes for a closed operating day before reading or changing stock', async () => {
    const now = new Date().toISOString().slice(0, 10);
    managerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "idempotencia"')) return [];
      if (sql.includes('FROM "configuracion_operativa"')) return [{ timeZone: 'America/Guayaquil' }];
      if (sql.includes('timezone($1, now())::date')) return [{ businessDate: now }];
      if (sql.includes('FROM "jornada_operativa"')) return [{ id: dayId, businessDate: now, status: 'closed' }];
      return [];
    });

    await expect(service.createMovement(
      dayId,
      productId,
      { type: 'restock', quantity: 2, reason: 'Delivery' },
      'closed-day-1',
      actor,
    )).rejects.toBeInstanceOf(ConflictException);
    expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes('FROM "inventario_diario" i JOIN "producto"'))).toBe(false);
    expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO "idempotencia"'))).toBe(false);
  });

  it('initializes zero units and records the initial movement and audit', async () => {
    const now = new Date().toISOString().slice(0, 10);
    managerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "idempotencia"')) return [];
      if (sql.includes('FROM "configuracion_operativa"')) return [{ timeZone: 'America/Guayaquil' }];
      if (sql.includes('timezone($1, now())::date')) return [{ businessDate: now }];
      if (sql.includes('FROM "jornada_operativa"')) return [{ id: dayId, businessDate: now, status: 'open' }];
      if (sql.includes('FROM "producto" p JOIN "categoria"')) return [{
        id: productId,
        sku: 'ceviche-pescado',
        name: 'Ceviche de pescado',
        categoryId: '66666666-6666-4666-8666-666666666666',
      }];
      if (sql.includes('SELECT 1 FROM "inventario_diario"')) return [];
      if (sql.includes('INSERT INTO "inventario_diario"')) return [{
        inventoryId,
        initialQuantity: 0,
        physicalQuantity: 0,
        reservedQuantity: 0,
      }];
      if (sql.includes('INSERT INTO "movimiento_inventario"')) return [{ id: movementId, type: 'initialization' }];
      return [];
    });

    const result = await service.initialize(
      dayId,
      { items: [{ productId, initialQuantity: 0 }] },
      'initialize-zero-1',
      actor,
    );

    expect(result.items[0]).toMatchObject({
      inventoryId,
      initialized: true,
      initialQuantity: 0,
      physicalQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
    });
    expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes("VALUES ($1, $2, 'initialization'"))).toBe(true);
    expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO "auditoria"'))).toBe(true);
    expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO "idempotencia"'))).toBe(true);
  });

  it('writes the balance, immutable movement, audit, and idempotency result in one transaction', async () => {
    const now = new Date().toISOString().slice(0, 10);
    managerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "idempotencia"')) return [];
      if (sql.includes('FROM "configuracion_operativa"')) return [{ timeZone: 'America/Guayaquil' }];
      if (sql.includes('timezone($1, now())::date')) return [{ businessDate: now }];
      if (sql.includes('FROM "jornada_operativa"')) return [{ id: dayId, businessDate: now, status: 'open' }];
      if (sql.includes('FROM "inventario_diario" i JOIN "producto"')) return [{
        id: inventoryId,
        initialQuantity: 10,
        physicalQuantity: 10,
        reservedQuantity: 2,
        productId,
        sku: 'sample',
        productName: 'Sample product',
      }];
      if (sql.includes('INSERT INTO "movimiento_inventario"')) return [{
        id: movementId,
        type: 'restock',
        physicalDelta: 5,
        previousQuantity: 10,
        resultingQuantity: 15,
        reason: 'Delivery received',
        occurredAt: new Date(),
      }];
      return [];
    });

    const result = await service.createMovement(
      dayId,
      productId,
      { type: 'restock', quantity: 5, reason: ' Delivery received ' },
      'restock-1',
      actor,
    );

    expect(result).toMatchObject({
      physicalQuantity: 15,
      reservedQuantity: 2,
      availableQuantity: 13,
      movement: { id: movementId, type: 'restock', physicalDelta: 5 },
    });
    const sql = managerQuery.mock.calls.map(([statement]) => String(statement));
    expect(sql.some((statement) => statement.includes('UPDATE "inventario_diario"'))).toBe(true);
    expect(sql.some((statement) => statement.includes('INSERT INTO "movimiento_inventario"'))).toBe(true);
    expect(sql.some((statement) => statement.includes('INSERT INTO "auditoria"'))).toBe(true);
    expect(sql.some((statement) => statement.includes('INSERT INTO "idempotencia"'))).toBe(true);
  });

  it('does not save an idempotency result when the audit insert fails', async () => {
    const now = new Date().toISOString().slice(0, 10);
    managerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "idempotencia"')) return [];
      if (sql.includes('FROM "configuracion_operativa"')) return [{ timeZone: 'America/Guayaquil' }];
      if (sql.includes('timezone($1, now())::date')) return [{ businessDate: now }];
      if (sql.includes('FROM "jornada_operativa"')) return [{ id: dayId, businessDate: now, status: 'open' }];
      if (sql.includes('FROM "inventario_diario" i JOIN "producto"')) return [{
        id: inventoryId,
        initialQuantity: 10,
        physicalQuantity: 10,
        reservedQuantity: 0,
        productId,
        sku: 'sample',
        productName: 'Sample product',
      }];
      if (sql.includes('INSERT INTO "movimiento_inventario"')) return [{ id: movementId }];
      if (sql.includes('INSERT INTO "auditoria"')) throw new Error('audit write failed');
      return [];
    });

    await expect(service.createMovement(
      dayId,
      productId,
      { type: 'restock', quantity: 1, reason: 'Delivery' },
      'audit-failure-1',
      actor,
    )).rejects.toThrow('audit write failed');
    expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO "idempotencia"'))).toBe(false);
  });
});
