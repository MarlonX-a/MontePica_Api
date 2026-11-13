import { type EntityManager } from 'typeorm';
import { vi } from 'vitest';

/** A controlled manager lets business tests inspect transaction ownership and supply persisted projections. */
export function createQueryManager() {
  const reads: unknown[][] = [];
  const writes: Array<{ raw: unknown[]; affected: number }> = [];
  const builders: Array<ReturnType<typeof createBuilder>> = [];
  const repositoryBuilders: Array<{
    entity: unknown;
    builder: ReturnType<typeof createBuilder>;
  }> = [];
  function createBuilder() {
    const builder = {
      select: vi.fn(),
      addSelect: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn(),
      andWhere: vi.fn(),
      orderBy: vi.fn(),
      addOrderBy: vi.fn(),
      groupBy: vi.fn(),
      having: vi.fn(),
      distinct: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
      setLock: vi.fn(),
      setParameters: vi.fn(),
      setParameter: vi.fn(),
      insert: vi.fn(),
      into: vi.fn(),
      values: vi.fn(),
      update: vi.fn(),
      set: vi.fn(),
      returning: vi.fn(),
      onConflict: vi.fn(),
      getRawMany: vi.fn( () => reads.shift() ?? []),
      execute: vi.fn(() =>
        Promise.resolve(writes.shift() ?? { raw: [], affected: 1 }),
      ),
    };
    for (const [name, mock] of Object.entries(builder))
      if (!['getRawMany', 'execute'].includes(name))
        mock.mockReturnValue(builder);
    return builder;
  }
  const manager = {
    createQueryBuilder: vi.fn(() => {
      const builder = createBuilder();
      builders.push(builder);
      return builder;
    }),
    getRepository: vi.fn((entity: unknown) => ({
      createQueryBuilder: () => {
        const builder = manager.createQueryBuilder();
        repositoryBuilders.push({ entity, builder });
        return builder;
      },
    })),
  };
  return {
    manager: manager as unknown as EntityManager,
    reads,
    writes,
    builders,
    repositoryBuilders,
  };
}
