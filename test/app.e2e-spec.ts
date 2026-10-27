import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/app.setup.js';
import { Category } from '../src/catalog/entities/category.entity.js';
import { Product } from '../src/catalog/entities/product.entity.js';
import { Client } from '../src/auth/entities/client.entity.js';
import { Profile } from '../src/auth/entities/profile.entity.js';
import { Role } from '../src/auth/entities/role.entity.js';
import { User } from '../src/auth/entities/user.entity.js';
import { UserSession } from '../src/auth/entities/user-session.entity.js';
import { AuthService } from '../src/auth/auth.service.js';

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
  const authService = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  };

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DB_HOST', '127.0.0.1');
    vi.stubEnv('DB_PORT', '5432');
    vi.stubEnv('DB_USERNAME', 'monte_pica_test');
    vi.stubEnv('DB_PASSWORD', 'test_only_password');
    vi.stubEnv('DB_NAME', 'monte_pica_test');
    vi.stubEnv('JWT_ACCESS_SECRET', 'test-only-secret-with-at-least-32-bytes');
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
    authService.register.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
    authService.login.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
    authService.refresh.mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    authService.logout.mockResolvedValue(undefined);
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
      .overrideProvider(getRepositoryToken(Client))
      .useValue({})
      .overrideProvider(getRepositoryToken(Profile))
      .useValue({})
      .overrideProvider(getRepositoryToken(Role))
      .useValue({})
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserSession))
      .useValue({})
      .overrideProvider(AuthService)
      .useValue(authService)
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
    expect(response.body.paths).toHaveProperty('/api/v1/admin/roles');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/users');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/categories');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/products/{id}/visibility');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/operating-days');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/operating-days/{dayId}/inventory');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/operating-days/{dayId}/inventory/initialize');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/operating-days/{dayId}/inventory/movements');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/operating-days/{dayId}/inventory/{productId}');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/operating-days/{dayId}/inventory/{productId}/movements');
    expect(response.body.paths).toHaveProperty('/api/v1/admin/operating-days/{dayId}/inventory/{productId}/adjustments');
    expect(response.body.paths).toHaveProperty('/api/v1/auth/change-password');
    expect(response.body.components.schemas.CreateAdminUserDto.properties).toHaveProperty('initialPassword');
    expect(response.body.components.schemas.VisibilityDto.properties).toEqual({
      visibleInMenu: expect.objectContaining({ type: 'boolean' }),
    });
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

  it('publishes auth routes and requires a bearer token for the current user', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(response.body.paths).toHaveProperty('/api/v1/auth/register');
    expect(response.body.paths).toHaveProperty('/api/v1/auth/login');
    expect(response.body.paths).toHaveProperty('/api/v1/auth/refresh');
    expect(response.body.paths).toHaveProperty('/api/v1/auth/logout');
    expect(response.body.paths['/api/v1/auth/me'].get.security).toEqual([
      { 'access-token': [] },
    ]);

    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/admin/products').expect(401);
    await request(app.getHttpServer()).get('/api/v1/admin/operating-days').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/admin/operating-days/22222222-2222-4222-8222-222222222222/inventory/initialize')
      .send({ items: [] })
      .expect(401);
  });

  it('accepts only public customer registration fields and documents token response', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'María Zambrano',
        email: 'maria@example.com',
        phone: '0987654321',
        password: 'MontePica123',
        termsAccepted: true,
      })
      .expect(201);
    expect(authService.register).toHaveBeenCalledOnce();

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'María Zambrano',
        email: 'maria@example.com',
        phone: '0987654321',
        password: 'MontePica123',
        termsAccepted: true,
        role: 'admin',
      })
      .expect(400);
    expect(authService.register).toHaveBeenCalledOnce();

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'bad' })
      .expect(400);
  });
});
