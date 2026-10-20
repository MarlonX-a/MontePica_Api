import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

describe('CatalogService', () => {
  const categories = { find: vi.fn() };
  const queryBuilder = {
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
  const products = { createQueryBuilder: vi.fn() };
  let service: CatalogService;

  beforeEach(() => {
    vi.resetAllMocks();
    for (const method of Object.values(queryBuilder)) {
      if (method !== queryBuilder.getManyAndCount && method !== queryBuilder.getOne) {
        method.mockReturnValue(queryBuilder);
      }
    }
    products.createQueryBuilder.mockReturnValue(queryBuilder);
    service = new CatalogService(categories as never, products as never);
  });

  it('lists active categories in deterministic order', async () => {
    categories.find.mockResolvedValue([
      { id: 'category-id', name: 'Ceviches', sortOrder: 0, active: true },
    ]);

    await expect(service.listCategories()).resolves.toEqual([
      { id: 'category-id', name: 'Ceviches', sortOrder: 0 },
    ]);
    expect(categories.find).toHaveBeenCalledWith({
      where: { active: true },
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });
  });

  it('combines visibility, category, literal search and pagination filters', async () => {
    queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    await expect(
      service.listProducts({
        categoryId: 'category-id',
        search: '100%_ceviche',
        page: 2,
        limit: 5,
      }),
    ).resolves.toEqual({ items: [], total: 0, page: 2, limit: 5 });

    expect(queryBuilder.where).toHaveBeenCalledWith('product.active = :active', {
      active: true,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'product.visibleInMenu = :visible',
      { visible: true },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'category.active = :categoryActive',
      { categoryActive: true },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'category.id = :categoryId',
      { categoryId: 'category-id' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      { search: '%100\\%\\_ceviche%' },
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(5);
    expect(queryBuilder.take).toHaveBeenCalledWith(5);
  });

  it('does not expose a product missing from the visible catalog', async () => {
    queryBuilder.getOne.mockResolvedValue(null);
    await expect(service.getProduct('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
