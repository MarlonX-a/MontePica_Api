import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import type { CatalogRepository } from './repositories/catalog.repository.js';
describe('CatalogService', () => {
  const repository = {
    listActiveCategories: vi.fn(),
    listVisibleProducts: vi.fn(),
    findVisibleProduct: vi.fn(),
  };
  const service = new CatalogService(
    repository as unknown as CatalogRepository,
  );
  beforeEach(() => vi.resetAllMocks());
  it('exposes only public category fields', async () => {
    repository.listActiveCategories.mockResolvedValue([
      { id: 'category', name: 'Ceviches', sortOrder: 0, active: true },
    ]);
    await expect(service.listCategories()).resolves.toEqual([
      { id: 'category', name: 'Ceviches', sortOrder: 0 },
    ]);
  });
  it('preserves pagination for empty results', async () => {
    repository.listVisibleProducts.mockResolvedValue([[], 0]);
    await expect(service.listProducts({ page: 2, limit: 5 })).resolves.toEqual({
      items: [],
      total: 0,
      page: 2,
      limit: 5,
    });
  });
  it('does not expose a missing or hidden product', async () => {
    repository.findVisibleProduct.mockResolvedValue(null);
    await expect(service.getProduct('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
