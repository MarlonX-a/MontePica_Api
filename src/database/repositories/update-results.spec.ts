import type { EntityManager } from 'typeorm';
import { OperationsRepository } from '../../operations/repositories/operations.repository.js';
import { RefundsRepository } from '../../tables/repositories/refunds.repository.js';
describe('PostgreSQL update projections', () => {
  it('normalizes TypeORM UPDATE RETURNING into rows for operational settings', async () => {
    const row = {
        id: 1,
        timeZone: 'America/Guayaquil',
        localOrderEditSeconds: 300,
      },
      query = vi.fn().mockResolvedValue([[row], 1]),
      manager = { query } as unknown as EntityManager;
    await expect(
      new OperationsRepository().updateSettingsUpdateConfiguracionOperativa(
        manager,
        {
          timeZone: 'America/Guayaquil',
          openingTime: '09:00',
          closingTime: '22:00',
          userId: 'user',
          localOrderEditSeconds: 300,
        },
      ),
    ).resolves.toEqual([row]);
    expect(query.mock.calls[0][1]).toEqual([
      'America/Guayaquil',
      '09:00',
      '22:00',
      'user',
      300,
    ]);
  });
  it('returns the persisted refund id instead of the driver tuple', async () => {
    const query = vi.fn().mockResolvedValue([[{ id_devolucion: 'refund' }], 1]),
      manager = { query } as unknown as EntityManager;
    await expect(
      new RefundsRepository().executeRefundUpdateDevolucion(manager, {
        id: 'refund',
        method: 'transfer',
        userId: 'admin',
        bankOperationReference: 'REF',
        recipientName: null,
        notes: null,
        cashRegisterId: null,
      }),
    ).resolves.toEqual([{ id_devolucion: 'refund' }]);
  });
});
