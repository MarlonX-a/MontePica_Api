import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/app.setup.js';
import { Category } from '../src/catalog/entities/category.entity.js';
import { Product } from '../src/catalog/entities/product.entity.js';

describe('API foundation (e2e)', () => {
  let app: INestApplication<App>;
  const query = vi.fn();
  const categoryRepository = { find: vi.fn() };
  const productQueryBuilder = {
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
  const productRepository = {
    createQueryBuilder: vi.fn(() => productQueryBuilder),
  };

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DB_HOST', '127.0.0.1');
    vi.stubEnv('DB_PORT', '5432');
    vi.stubEnv('DB_USERNAME', 'monte_pica_test');
    vi.stubEnv('DB_PASSWORD', 'test_only_password');
    vi.stubEnv('DB_NAME', 'monte_pica_test');
    vi.stubEnv('CORS_ORIGINS', 'http://localhost:8081');
    query.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    categoryRepository.find.mockReset().mockResolvedValue([]);
    for (const method of Object.values(productQueryBuilder)) {
      method.mockReset();
      if (
        method !== productQueryBuilder.getManyAndCount &&
        method !== productQueryBuilder.getOne
      ) {
        method.mockReturnValue(productQueryBuilder);
      }
    }
    productQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
    productQueryBuilder.getOne.mockResolvedValue(null);
    const { AppModule } = await import('../src/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DataSource)
      .useValue({ query, manager: {} })
      .overrideProvider(getRepositoryToken(Category))
      .useValue(categoryRepository)
      .overrideProvider(getRepositoryToken(Product))
      .useValue(productRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
    vi.unstubAllEnvs();
  });

  it('serves liveness without querying PostgreSQL', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports PostgreSQL readiness and returns a structured 503 on failure', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });

    query.mockRejectedValueOnce(new Error('database unavailable'));
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503)
      .expect(({ body }) => {
        expect(body.statusCode).toBe(503);
        expect(body.message).toBe('La base de datos no está disponible.');
      });
  });

  it('publishes the status endpoints in the OpenAPI document', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(response.body.paths).toHaveProperty('/api/v1/health');
    expect(response.body.paths).toHaveProperty('/api/v1/health/ready');
    expect(response.body.paths).toHaveProperty('/api/v1/categories');
    expect(response.body.paths).toHaveProperty('/api/v1/products');
    expect(response.body.paths).toHaveProperty('/api/v1/products/{id}');
  });

  it('validates catalog filters and returns an empty paginated list', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200)
      .expect([]);
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .expect(200)
      .expect({ items: [], total: 0, page: 1, limit: 20 });
    await request(app.getHttpServer())
      .get('/api/v1/products?limit=101')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/products?categoryId=invalid')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/products/not-a-uuid')
      .expect(400);
  });
});
