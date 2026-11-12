import { CatalogService } from './catalog.service.js';

describe('Public catalogue projections', () => {
  function fixture() {
    const categories = { find: vi.fn() },
      builder = {
        innerJoinAndSelect: vi.fn(),
        where: vi.fn(),
        andWhere: vi.fn(),
        orderBy: vi.fn(),
        addOrderBy: vi.fn(),
        skip: vi.fn(),
        take: vi.fn(),
        getManyAndCount: vi.fn(),
        getOne: vi.fn(),
      };
    for (const [name, fn] of Object.entries(builder))
      if (!['getManyAndCount', 'getOne'].includes(name))
        fn.mockReturnValue(builder);
    const products = { createQueryBuilder: vi.fn(() => builder) };
    return {
      categories,
      builder,
      service: new CatalogService(categories as never, products as never),
    };
  }
  it('exposes only public category fields', async () => {
    const f = fixture();
    f.categories.find.mockResolvedValue([
      { id: 'category', name: 'Ceviches', sortOrder: 0, active: true },
    ]);
    await expect(f.service.listCategories()).resolves.toEqual([
      { id: 'category', name: 'Ceviches', sortOrder: 0 },
    ]);
  });
  it('preserves pagination with no products', async () => {
    const f = fixture();
    f.builder.getManyAndCount.mockResolvedValue([[], 0]);
    await expect(
      f.service.listProducts({ page: 2, limit: 5 }),
    ).resolves.toEqual({ items: [], total: 0, page: 2, limit: 5 });
  });
  it('does not expose a hidden or missing product', async () => {
    const f = fixture();
    f.builder.getOne.mockResolvedValue(null);
    await expect(f.service.getProduct('missing')).rejects.toThrow(
      'Producto no encontrado',
    );
  });
});
