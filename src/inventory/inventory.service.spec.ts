import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type DataSource, type Repository } from 'typeorm';
import { createQueryManager } from '../../test/support/query-builder.js';
import { AuditService } from '../common/audit/audit.service.js';
import { IdempotencyRecord } from '../common/idempotency/entities/idempotency-record.entity.js';
import { TransactionLocksService } from '../common/transactions/transaction-locks.service.js';
import { DailyInventory } from './entities/daily-inventory.entity.js';
import { InventoryService } from './inventory.service.js';

describe('InventoryService transactional rules', () => {
  const actor = { userId: 'user', sessionId: 'session' };
  function fixture() {
    const context = createQueryManager(),
      audit = { append: vi.fn() },
      locks = { acquire: vi.fn(), acquireIdempotency: vi.fn() };
    const transaction = vi.fn(
      async (work: (manager: typeof context.manager) => unknown) =>
        work(context.manager),
    );
    const service = new InventoryService(
      { manager: context.manager } as Repository<DailyInventory>,
      { transaction } as unknown as DataSource,
      audit as unknown as AuditService,
      locks as unknown as TransactionLocksService,
    );
    const prepare = () =>
      context.reads.push(
        [],
        [{ timeZone: 'America/Guayaquil' }],
        [{ businessDate: '2026-11-05' }],
        [{ id: 'day', businessDate: '2026-11-05', status: 'open' }],
        [
          {
            id: 'inventory',
            initialQuantity: 10,
            physicalQuantity: 10,
            reservedQuantity: 4,
            productId: 'product',
            sku: 'sample',
            productName: 'Producto',
          },
        ],
      );
    return { ...context, audit, locks, transaction, service, prepare };
  }
  it('requires an idempotency key before opening a transaction', async () => {
    const f = fixture();
    await expect(
      f.service.adjust(
        'day',
        'product',
        { countedQuantity: 2, reason: 'Conteo' },
        undefined,
        actor,
      ),
    ).rejects.toThrow('Idempotency-Key');
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it('replays the saved response without locking or changing stock', async () => {
    const f = fixture(),
      body = { type: 'waste' as const, quantity: 2, reason: 'Scrap' },
      response = { inventoryId: 'inventory', physicalQuantity: 3 };
    const requestHash = createHash('sha256')
      .update('{"quantity":2,"reason":"Scrap","type":"waste"}')
      .digest('hex');
    f.reads.push([{ requestHash, response }]);
    await expect(
      f.service.createMovement('day', 'product', body, 'retry', actor),
    ).resolves.toEqual(response);
    expect(f.locks.acquire).not.toHaveBeenCalled();
    expect(f.builders.every((b) => !b.execute.mock.calls.length)).toBe(true);
  });
  it('rejects an idempotency key reused with other content', async () => {
    const f = fixture();
    f.reads.push([{ requestHash: 'other', response: {} }]);
    await expect(
      f.service.createMovement(
        'day',
        'product',
        { type: 'waste', quantity: 2, reason: 'Scrap' },
        'retry',
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.audit.append).not.toHaveBeenCalled();
  });
  it('protects reserved stock from a lower physical count', async () => {
    const f = fixture();
    f.prepare();
    await expect(
      f.service.adjust(
        'day',
        'product',
        { countedQuantity: 3, reason: 'Conteo' },
        'adjust',
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.audit.append).not.toHaveBeenCalled();
    expect(f.builders.every((b) => !b.execute.mock.calls.length)).toBe(true);
  });
  it('rejects a closed operating day before touching inventory', async () => {
    const f = fixture();
    f.prepare();
    f.reads[3] = [{ status: 'closed', businessDate: '2026-11-05' }];
    await expect(
      f.service.createMovement(
        'day',
        'product',
        { type: 'restock', quantity: 1, reason: 'Entrada' },
        'closed',
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.reads).toHaveLength(1);
  });
  it('coordinates stock, movement, audit and idempotency in one transaction', async () => {
    const f = fixture();
    f.prepare();
    f.writes.push(
      { raw: [], affected: 1 },
      { raw: [{ id: 'movement', type: 'restock' }], affected: 1 },
    );
    const result = await f.service.createMovement(
      'day',
      'product',
      { type: 'restock', quantity: 5, reason: 'Entrada' },
      'restock',
      actor,
    );
    expect(result).toMatchObject({
      physicalQuantity: 15,
      reservedQuantity: 4,
      availableQuantity: 11,
    });
    expect(f.transaction).toHaveBeenCalledOnce();
    expect(f.audit.append.mock.calls[0][0]).toBe(f.manager);
    expect(
      f.repositoryBuilders.some(
        ({ entity, builder }) =>
          entity === IdempotencyRecord && builder.insert.mock.calls.length > 0,
      ),
    ).toBe(true);
  });
  it('does not save an idempotent success after audit failure', async () => {
    const f = fixture();
    f.prepare();
    f.audit.append.mockRejectedValue(new Error('audit write failed'));
    await expect(
      f.service.createMovement(
        'day',
        'product',
        { type: 'restock', quantity: 1, reason: 'Entrada' },
        'fail',
        actor,
      ),
    ).rejects.toThrow('audit write failed');
    expect(
      f.repositoryBuilders.some(
        ({ entity, builder }) =>
          entity === IdempotencyRecord && builder.insert.mock.calls.length > 0,
      ),
    ).toBe(false);
  });
});
