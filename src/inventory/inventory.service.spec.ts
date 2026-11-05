import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { AuditRepository } from '../database/repositories/audit.repository.js';
import { InventoryService } from './inventory.service.js';
import type { InventoryRepository } from './repositories/inventory.repository.js';
describe('InventoryService', () => {
  const manager = {},
    actor = { userId: 'user', sessionId: 'session' },
    dayId = 'day',
    productId = 'product',
    inventoryId = 'inventory';
  const repository = {
    idempotentFindOperation: vi.fn(),
    idempotentFindIdempotencia: vi.fn(),
    idempotentInsertIdempotencia: vi.fn(),
    lockCurrentOperatingDayFindOperation: vi.fn(),
    lockCurrentOperatingDayFindConfiguracionOperativa: vi.fn(),
    lockCurrentOperatingDayFindOperationNext: vi.fn(),
    lockCurrentOperatingDayFindJornadaOperativa: vi.fn(),
    lockInventoryFindInventarioDiario: vi.fn(),
    initializeFindProducto: vi.fn(),
    initializeFindInventarioDiario: vi.fn(),
    initializeInsertInventarioDiario: vi.fn(),
    initializeInsertMovimientoInventario: vi.fn(),
    writeMovementUpdateInventarioDiario: vi.fn(),
    writeMovementInsertMovimientoInventario: vi.fn(),
  };
  const audit = { append: vi.fn() },
    transaction = vi.fn((work: (context: typeof manager) => unknown) =>
      work(manager),
    );
  const service = new InventoryService(
    { transaction } as unknown as DataSource,
    repository as unknown as InventoryRepository,
    audit as unknown as AuditRepository,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation((work) => work(manager));
    repository.idempotentFindIdempotencia.mockResolvedValue([]);
    repository.lockCurrentOperatingDayFindConfiguracionOperativa.mockResolvedValue(
      [{ timeZone: 'America/Guayaquil' }],
    );
    repository.lockCurrentOperatingDayFindOperationNext.mockResolvedValue([
      { businessDate: '2026-11-05' },
    ]);
    repository.lockCurrentOperatingDayFindJornadaOperativa.mockResolvedValue([
      { id: dayId, businessDate: '2026-11-05', status: 'open' },
    ]);
    repository.lockInventoryFindInventarioDiario.mockResolvedValue([
      {
        id: inventoryId,
        initialQuantity: 10,
        physicalQuantity: 10,
        reservedQuantity: 4,
        productId,
        sku: 'sample',
        productName: 'Producto',
      },
    ]);
    repository.writeMovementInsertMovimientoInventario.mockResolvedValue([
      { id: 'movement', type: 'restock' },
    ]);
  });
  it('replays the original response before touching inventory', async () => {
    const body = { type: 'waste', quantity: 2, reason: 'Scrap' },
      response = { inventoryId, physicalQuantity: 3 };
    const requestHash = createHash('sha256')
      .update('{"quantity":2,"reason":"Scrap","type":"waste"}')
      .digest('hex');
    repository.idempotentFindIdempotencia.mockResolvedValue([
      { requestHash, response },
    ]);
    await expect(
      service.createMovement(dayId, productId, body, 'retry', actor),
    ).resolves.toEqual(response);
    expect(repository.lockInventoryFindInventarioDiario).not.toHaveBeenCalled();
  });
  it('rejects reuse of an idempotency key with different content', async () => {
    repository.idempotentFindIdempotencia.mockResolvedValue([
      { requestHash: 'other', response: {} },
    ]);
    await expect(
      service.createMovement(
        dayId,
        productId,
        { type: 'waste', quantity: 2, reason: 'Scrap' },
        'retry',
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      repository.writeMovementUpdateInventarioDiario,
    ).not.toHaveBeenCalled();
  });
  it('requires an idempotency key', async () => {
    await expect(
      service.adjust(
        dayId,
        productId,
        { countedQuantity: 2, reason: 'Conteo' },
        undefined,
        actor,
      ),
    ).rejects.toThrow('Idempotency-Key');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('protects reserved quantities from physical adjustments', async () => {
    await expect(
      service.adjust(
        dayId,
        productId,
        { countedQuantity: 3, reason: 'Conteo' },
        'adjust',
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      repository.writeMovementUpdateInventarioDiario,
    ).not.toHaveBeenCalled();
  });
  it('rejects writes on closed days before touching inventory', async () => {
    repository.lockCurrentOperatingDayFindJornadaOperativa.mockResolvedValue([
      { status: 'closed', businessDate: '2026-11-05' },
    ]);
    await expect(
      service.createMovement(
        dayId,
        productId,
        { type: 'restock', quantity: 1, reason: 'Entrada' },
        'closed',
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.lockInventoryFindInventarioDiario).not.toHaveBeenCalled();
  });
  it('initializes zero units with an initial movement and audit', async () => {
    repository.initializeFindProducto.mockResolvedValue([
      {
        id: productId,
        sku: 'sample',
        name: 'Producto',
        categoryId: 'category',
      },
    ]);
    repository.initializeFindInventarioDiario.mockResolvedValue([]);
    repository.initializeInsertInventarioDiario.mockResolvedValue([
      {
        inventoryId,
        initialQuantity: 0,
        physicalQuantity: 0,
        reservedQuantity: 0,
      },
    ]);
    repository.initializeInsertMovimientoInventario.mockResolvedValue([
      { id: 'movement', type: 'initialization' },
    ]);
    const result = await service.initialize(
      dayId,
      { items: [{ productId, initialQuantity: 0 }] },
      'init',
      actor,
    );
    expect(result.items[0]).toMatchObject({
      physicalQuantity: 0,
      availableQuantity: 0,
    });
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      actor,
      'inventario_diario',
      inventoryId,
      'inventory.initialized',
      expect.any(Object),
    );
  });
  it('coordinates balance, movement, audit and idempotency in one transaction', async () => {
    const result = await service.createMovement(
      dayId,
      productId,
      { type: 'restock', quantity: 5, reason: 'Entrada' },
      'restock',
      actor,
    );
    expect(result).toMatchObject({
      physicalQuantity: 15,
      reservedQuantity: 4,
      availableQuantity: 11,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(repository.writeMovementUpdateInventarioDiario).toHaveBeenCalledWith(
      manager,
      { id: inventoryId, nextQuantity: 15 },
    );
    expect(audit.append.mock.calls[0][0]).toBe(manager);
    expect(repository.idempotentInsertIdempotencia.mock.calls[0][0]).toBe(
      manager,
    );
  });
  it('propagates audit failure and never persists an idempotent success', async () => {
    audit.append.mockRejectedValue(new Error('audit write failed'));
    await expect(
      service.createMovement(
        dayId,
        productId,
        { type: 'restock', quantity: 1, reason: 'Entrada' },
        'fail',
        actor,
      ),
    ).rejects.toThrow('audit write failed');
    expect(repository.idempotentInsertIdempotencia).not.toHaveBeenCalled();
  });
});
