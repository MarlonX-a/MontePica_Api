import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createDatabaseOptions } from '../src/database/database.options.js';
import { configureApp } from '../src/app.setup.js';
import {
  GuestSessionsService,
  hashAccessSecret,
} from '../src/tables/guest-sessions.service.js';
import { TablesService } from '../src/tables/tables.service.js';
import { TableAccessService } from '../src/tables/table-access.service.js';
import { CreateCatalogTables1792080000000 } from '../src/database/migrations/1792080000000-CreateCatalogTables.js';
import { CreateIdentityTables1792340000000 } from '../src/database/migrations/1792340000000-CreateIdentityTables.js';
import { CreatePermissionsAndAudit1792600000000 } from '../src/database/migrations/1792600000000-CreatePermissionsAndAudit.js';
import { AllowUncategorizedProducts1793200000000 } from '../src/database/migrations/1793200000000-AllowUncategorizedProducts.js';
import { RequireProductCategory1793300000000 } from '../src/database/migrations/1793300000000-RequireProductCategory.js';
import { CreateOperationsOpening1793400000000 } from '../src/database/migrations/1793400000000-CreateOperationsOpening.js';
import { CreateDailyInventory1793500000000 } from '../src/database/migrations/1793500000000-CreateDailyInventory.js';
import { CreateTableVisits1793600000000 } from '../src/database/migrations/1793600000000-CreateTableVisits.js';
import { CreateLocalOrders1793700000000 } from '../src/database/migrations/1793700000000-CreateLocalOrders.js';
import { OrderLifecycle1793800000000 } from '../src/database/migrations/1793800000000-OrderLifecycle.js';
import { CreateSettlements1793900000000 } from '../src/database/migrations/1793900000000-CreateSettlements.js';
import { CreateCashPayments1794000000000 } from '../src/database/migrations/1794000000000-CreateCashPayments.js';
import { CreateTransferReceipts1794100000000 } from '../src/database/migrations/1794100000000-CreateTransferReceipts.js';
import { CreateDeliveryCoverage1794200000000 } from '../src/database/migrations/1794200000000-CreateDeliveryCoverage.js';
import { DeliveryOrders1794300000000 } from '../src/database/migrations/1794300000000-DeliveryOrders.js';
import { CancellationRequests1794500000000 } from '../src/database/migrations/1794500000000-CancellationRequests.js';
import { ExecuteRefunds1794600000000 } from '../src/database/migrations/1794600000000-ExecuteRefunds.js';
import { PointsProgram1794700000000 } from '../src/database/migrations/1794700000000-PointsProgram.js';
import { LocalRewards1794800000000 } from '../src/database/migrations/1794800000000-LocalRewards.js';
import { CashRegisterClosures1794900000000 } from '../src/database/migrations/1794900000000-CashRegisterClosures.js';
import { OperatingDayClosures1795000000000 } from '../src/database/migrations/1795000000000-OperatingDayClosures.js';
import { DeliveryFulfillment1794400000000 } from '../src/database/migrations/1794400000000-DeliveryFulfillment.js';
import { DeliveryExpiryService } from '../src/tables/delivery-expiry.service.js';
import { RewardsService } from '../src/rewards/rewards.service.js';
import { ReceiptStorageService } from '../src/tables/receipt-storage.service.js';
import { CatalogSeedRepository } from '../src/catalog/repositories/catalog-seed.repository.js';
import { BootstrapRepository } from '../src/database/repositories/bootstrap.repository.js';

// Opt-in only: credentials from .env are used against postgres to CREATE a fresh, disposable database.
// Never connects to DB_NAME from .env. Requires CREATEDB; no migrations are applied to MontePica.
describe.skipIf(process.env.RUN_POSTGRES_E2E !== '1')(
  'Table access against isolated PostgreSQL',
  () => {
    let app: INestApplication;
    let control: DataSource;
    let db: DataSource;
    let created = false;
    const databaseName = `mp_qr_test_${randomUUID().replaceAll('-', '')}`;
    const tokens: Record<string, string> = {};
    const users: Record<string, string> = {};
    let dayId: string;
    let guests: GuestSessionsService;
    let tables: TablesService;
    let access: TableAccessService;
    let counter = 0;
    const receiptObjects = new Map<string, Buffer>();
    let receiptUnavailable = false;
    const http = () => app.getHttpServer();
    const auth = (token: string) => `Bearer ${token}`;

    beforeAll(async () => {
      const credentials = parse(readFileSync('.env'));
      const env = {
        ...credentials,
        NODE_ENV: 'test',
        DB_NAME: databaseName,
        DB_LOGGING: 'false',
        JWT_ACCESS_SECRET: 'postgres-test-secret-at-least-32-bytes-long',
        CORS_ORIGINS: '',
      };
      const options = createDatabaseOptions(env);
      control = new DataSource({
        ...options,
        database: 'postgres',
        entities: [],
        migrations: [],
      });
      await control.initialize();
      await control.query(`CREATE DATABASE "${databaseName}"`);
      created = true;
      db = new DataSource({
        ...options,
        migrations: [
          CreateCatalogTables1792080000000,
          CreateIdentityTables1792340000000,
          CreatePermissionsAndAudit1792600000000,
          AllowUncategorizedProducts1793200000000,
          RequireProductCategory1793300000000,
          CreateOperationsOpening1793400000000,
          CreateDailyInventory1793500000000,
          CreateTableVisits1793600000000,
          CreateLocalOrders1793700000000,
          OrderLifecycle1793800000000,
          CreateSettlements1793900000000,
          CreateCashPayments1794000000000,
          CreateTransferReceipts1794100000000,
          CreateDeliveryCoverage1794200000000,
          DeliveryOrders1794300000000,
          DeliveryFulfillment1794400000000,
          CancellationRequests1794500000000,
          ExecuteRefunds1794600000000,
          PointsProgram1794700000000,
          LocalRewards1794800000000,
          CashRegisterClosures1794900000000,
          OperatingDayClosures1795000000000,
        ],
      });
      await db.initialize();
      await db.runMigrations();
      // Empty-database up/down/up check; never revert a database containing user data.
      await db.undoLastMigration();
      await db.runMigrations();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const { AppModule } = await import('../src/app.module.js');
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource)
        .useValue(db)
        .overrideProvider(ReceiptStorageService)
        .useValue({
          prefix: 'test/receipts/',
          put: async (key: string, body: Buffer) => {
            if (receiptUnavailable)
              throw new ServiceUnavailableException(
                'Almacenamiento no disponible.',
              );
            receiptObjects.set(key, Buffer.from(body));
          },
          get: async (key: string) => {
            const body = receiptObjects.get(key);
            if (!body) throw new Error('missing');
            return body;
          },
          delete: async (key: string) => {
            receiptObjects.delete(key);
          },
        })
        .compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.init();
      guests = app.get(GuestSessionsService);
      tables = app.get(TablesService);
      access = app.get(TableAccessService);
      for (const role of ['admin', 'worker', 'client']) {
        const [user] = await db.query(
          `INSERT INTO usuario (id_rol,correo_normalizado,password_hash)
        SELECT id_rol,$2,'test-unused-password-hash' FROM rol WHERE codigo=$1 RETURNING id_usuario`,
          [role, `${role}@test.invalid`],
        );
        users[role] = user.id_usuario;
        await db.query(
          `INSERT INTO perfil (id_usuario,nombres) VALUES ($1,$2)`,
          [user.id_usuario, role],
        );
        if (role === 'client')
          await db.query(`INSERT INTO cliente (id_usuario) VALUES ($1)`, [
            user.id_usuario,
          ]);
        const [session] = await db.query(
          `INSERT INTO sesion_usuario (id_usuario,refresh_hash,expira_en) VALUES ($1,$2,now()+interval '1 day') RETURNING id_sesion_usuario`,
          [user.id_usuario, hashAccessSecret(randomUUID())],
        );
        tokens[role] = await app.get(JwtService).signAsync({
          sub: user.id_usuario,
          sid: session.id_sesion_usuario,
          av: 0,
        });
      }
      const [day] = await db.query(
        `INSERT INTO jornada_operativa (fecha_operativa,abierta_por)
      SELECT timezone(zona_horaria,clock_timestamp())::date,$1 FROM configuracion_operativa RETURNING id_jornada`,
        [users.admin],
      );
      dayId = day.id_jornada;
    }, 60000);

    afterAll(async () => {
      try {
        if (app) await app.close();
      } finally {
        if (db?.isInitialized) await db.destroy();
        if (control?.isInitialized) {
          if (created) {
            await control.query(
              'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
              [databaseName],
            );
            await control.query(`DROP DATABASE "${databaseName}"`);
          }
          await control.destroy();
        }
        vi.unstubAllEnvs();
      }
    }, 30000);

    async function fixture() {
      const table = await tables.createTable(`M${++counter}`, users.admin);
      const visit = await tables.openVisit(table.id, users.admin);
      const qr = await tables.issueQr(visit.id, users.admin);
      return { table, visit, qr };
    }

    async function failAudit(event: string) {
      await db.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger AS $$ BEGIN
      IF NEW.evento = '${event}' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await db.query(
        `CREATE TRIGGER test_audit_failure BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`,
      );
    }
    async function restoreAudit() {
      await db.query('DROP TRIGGER test_audit_failure ON auditoria');
      await db.query('DROP FUNCTION reject_test_audit()');
    }

    async function createCashRefundFixture(index: number, amount: number) {
      const settings = await request(http())
        .put('/api/v1/admin/delivery/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', `9b-cash-settings-${index}`)
        .send({
          enabled: true,
          coverageDescription: 'Centro',
          shippingFeeCents: 0,
        })
        .expect(200);
      const coverage = await request(http())
        .post('/api/v1/me/delivery-requests')
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', `9b-cash-coverage-${index}`)
        .send({
          configurationVersion: settings.body.version,
          recipientName: 'Cliente',
          phone: '099',
          address: `Direccion ${index}`,
        })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/delivery-requests/${coverage.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', `9b-cash-coverage-approve-${index}`)
        .send({})
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ($1,$2) RETURNING id_categoria`,
        [`9B cash ${index}`, `9b cash ${index}`],
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,$2,'Producto', $3, false) RETURNING id_producto`,
        [category.id_categoria, `9b-cash-${index}`, amount],
      );
      const order = await request(http())
        .post(`/api/v1/me/delivery-requests/${coverage.body.id}/orders`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', `9b-cash-order-${index}`)
        .send({ items: [{ productId: product.id_producto, quantity: 1 }] })
        .expect(201);
      const proof = await request(http())
        .post(
          `/api/v1/me/settlements/${order.body.settlement.id}/transfer-payments`,
        )
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', `9b-cash-proof-${index}`)
        .attach('file', Buffer.from('%PDF-1.7 proof'), {
          filename: 'proof.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/payments/${proof.body.id}/confirm`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', `9b-cash-confirm-${index}`)
        .send({ bankOperationReference: `9B-CASH-${index}` })
        .expect(200);
      const cancellation = await request(http())
        .post(`/api/v1/me/orders/${order.body.id}/cancellation-requests`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', `9b-cash-cancel-${index}`)
        .send({ expectedVersion: 1, reason: 'Devolucion en efectivo' })
        .expect(201);
      const refund = await request(http())
        .post(
          `/api/v1/admin/cancellation-requests/${cancellation.body.id}/approve`,
        )
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', `9b-cash-cancel-approve-${index}`)
        .send({})
        .expect(200);
      return refund.body.refund.id as string;
    }

    it('returns the operational settings object after UPDATE RETURNING', async () => {
      const result = await request(http())
        .patch('/api/v1/admin/operations/settings')
        .set('Authorization', auth(tokens.admin))
        .send({ localOrderEditSeconds: 300 })
        .expect(200);
      expect(Array.isArray(result.body)).toBe(false);
      expect(result.body).toMatchObject({
        id: 1,
        localOrderEditSeconds: 300,
        timeZone: 'America/Guayaquil',
      });
    });

    it('runs command repositories without an HTTP server or overwriting catalog changes', async () => {
      const catalog = new CatalogSeedRepository(),
        bootstrap = new BootstrapRepository();
      const category = {
          normalizedName: 'refactor-command',
          name: 'Comando',
          sortOrder: 0,
        },
        product = {
          category: category.normalizedName,
          sku: 'refactor-command-product',
          name: 'Producto',
          description: 'Ejemplo',
          priceCents: 100,
          sortOrder: 0,
        };
      await db.transaction(async (manager) => {
        await bootstrap.lockAdministratorCreation(manager);
        expect(await bootstrap.countAdministrators(manager)).toBe(1);
        expect(await bootstrap.emailExists(manager, 'admin@test.invalid')).toBe(
          true,
        );
        expect(await bootstrap.findAdministratorRole(manager)).toBeTruthy();
        await catalog.insertCategoryIfMissing(manager, category);
        await catalog.insertProductIfMissing(manager, product);
      });
      await db.query('UPDATE producto SET precio_ctvs=250 WHERE sku=$1', [
        product.sku,
      ]);
      await db.transaction(async (manager) => {
        await catalog.insertCategoryIfMissing(manager, category);
        await catalog.insertProductIfMissing(manager, product);
      });
      const rows = await db.query(
        'SELECT precio_ctvs FROM producto WHERE sku=$1',
        [product.sku],
      );
      expect(rows).toEqual([{ precio_ctvs: 250 }]);
    });

    it('configures points with authorization, validation, idempotency and audited rollback', async () => {
      const initial = await request(http())
        .get('/api/v1/points/settings')
        .expect(200);
      expect(initial.body.enabled).toBe(false);
      const guest = await guests.create({ name: 'Puntos invitado' });
      await request(http())
        .get('/api/v1/me/points')
        .set('Authorization', auth(guest.token))
        .expect(401);
      await request(http())
        .get('/api/v1/me/points')
        .set('Authorization', auth(tokens.worker))
        .expect(403);
      await request(http())
        .put('/api/v1/admin/points/settings')
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'points-denied')
        .send({ enabled: true, pointsPerDollar: 2 })
        .expect(403);
      await request(http())
        .put('/api/v1/admin/points/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'points-invalid')
        .send({ enabled: true, pointsPerDollar: 0 })
        .expect(400);
      const update = () =>
        request(http())
          .put('/api/v1/admin/points/settings')
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', 'points-enable')
          .send({ enabled: true, pointsPerDollar: 2 });
      await failAudit('points.settings_updated');
      try {
        await update().expect(500);
      } finally {
        await restoreAudit();
      }
      const configured = await update().expect(200);
      expect(configured.body.version).toBe(2);
      expect((await update().expect(200)).body).toEqual(configured.body);
      const pointsRunner = db.createQueryRunner();
      await pointsRunner.connect();
      await pointsRunner.startTransaction();
      try {
        await expect(
          new PointsProgram1794700000000().down(pointsRunner),
        ).rejects.toThrow('existen configuraciones');
      } finally {
        await pointsRunner.rollbackTransaction();
        await pointsRunner.release();
      }
      await expect(
        db.query(
          'UPDATE configuracion_puntos SET habilitado=false WHERE version=2',
        ),
      ).rejects.toThrow('inmutables');
      await request(http())
        .get('/api/v1/me/points/movements')
        .set('Authorization', auth(tokens.client))
        .expect(200);
      await request(http())
        .get(
          '/api/v1/admin/clients/00000000-0000-0000-0000-000000000000/points',
        )
        .set('Authorization', auth(tokens.worker))
        .expect(404);
    });

    it('creates an idempotent order, reserves stock and prevents closing an account with consumption', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Pedido' });
      const other = await guests.create({ name: 'Otro' });
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'order-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Pedido' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'order-approve')
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('Pedido test','pedido test') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs) VALUES ($1,'pedido-test','Producto',650) RETURNING id_producto`,
        [category.id_categoria],
      );
      await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,inicializado_por) VALUES ($1,$2,2,2,$3)`,
        [dayId, product.id_producto, users.admin],
      );
      const url = `/api/v1/visits/${f.visit.id}/orders`;
      const body = { items: [{ productId: product.id_producto, quantity: 2 }] };
      const submit = (key: string) =>
        request(http())
          .post(url)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', key)
          .send(body);
      await request(http())
        .post(url)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'duplicate')
        .send({ items: [...body.items, ...body.items] })
        .expect(400);
      await request(http())
        .post(url)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'invalid')
        .send({ items: [{ productId: product.id_producto, quantity: 0 }] })
        .expect(400);
      await db.query(
        'UPDATE producto SET visible_menu=false WHERE id_producto=$1',
        [product.id_producto],
      );
      await submit('hidden').expect(409);
      await db.query(
        'UPDATE producto SET visible_menu=true WHERE id_producto=$1',
        [product.id_producto],
      );
      const order = await submit('order-1').expect(201);
      expect(order.body.totalCents).toBe(1300);
      expect((await submit('order-1').expect(201)).body).toEqual(order.body);
      await submit('order-2').expect(409);
      await request(http())
        .get(`/api/v1/me/orders/${order.body.id}`)
        .set('Authorization', auth(other.token))
        .expect(404);
      await request(http())
        .get(`/api/v1/admin/orders/${order.body.id}`)
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      const list = await request(http())
        .get(`/api/v1/me/orders?visitId=${f.visit.id}&page=1&limit=1`)
        .set('Authorization', auth(guest.token))
        .expect(200);
      expect(list.body.total).toBe(1);
      await request(http())
        .post(`/api/v1/me/participants/${p.body.id}/leave`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'order-leave')
        .expect(409);
      await request(http())
        .post(`/api/v1/admin/visits/${f.visit.id}/close`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'order-close')
        .expect(409);
      const [stock] = await db.query(
        'SELECT cantidad_fisica,cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [product.id_producto],
      );
      expect(stock).toEqual({ cantidad_fisica: 2, cantidad_reservada: 2 });
      await db.query(
        'UPDATE producto SET precio_ctvs=999 WHERE id_producto=$1',
        [product.id_producto],
      );
      await request(http())
        .put(`/api/v1/me/orders/${order.body.id}`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'too-many')
        .send({
          expectedVersion: 1,
          items: [{ productId: product.id_producto, quantity: 3 }],
        })
        .expect(409);
      const editBody = {
        expectedVersion: 1,
        items: [{ productId: product.id_producto, quantity: 1 }],
      };
      const edit = () =>
        request(http())
          .put(`/api/v1/me/orders/${order.body.id}`)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', 'edit-order')
          .send(editBody);
      const edited = await edit().expect(200);
      expect(edited.body.version).toBe(2);
      expect(edited.body.totalCents).toBe(650);
      expect((await edit().expect(200)).body).toEqual(edited.body);
      await request(http())
        .put(`/api/v1/me/orders/${order.body.id}`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'stale-edit')
        .send(editBody)
        .expect(409);
      const start = () =>
        request(http())
          .post(`/api/v1/admin/orders/${order.body.id}/start-preparation`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'prepare-order')
          .send({ expectedVersion: 2 });
      expect((await start().expect(200)).body.status).toBe('preparing');
      await start().expect(200);
      const [consumed] = await db.query(
        'SELECT cantidad_fisica,cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [product.id_producto],
      );
      expect(consumed).toEqual({ cantidad_fisica: 1, cantidad_reservada: 0 });
      await request(http())
        .post(`/api/v1/admin/orders/${order.body.id}/ready`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'ready-order')
        .send({ expectedVersion: 2 })
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/orders/${order.body.id}/deliver`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'deliver-order')
        .send({ expectedVersion: 2 })
        .expect(200);
      const history = await request(http())
        .get(`/api/v1/me/orders/${order.body.id}/history`)
        .set('Authorization', auth(guest.token))
        .expect(200);
      expect(history.body.versions).toHaveLength(2);
      const accountId = order.body.accountId;
      const ownAccount = await request(http())
        .get(`/api/v1/me/accounts/${accountId}`)
        .set('Authorization', auth(guest.token))
        .expect(200);
      expect(ownAccount.body.totalCents).toBe(650);
      await request(http())
        .get(`/api/v1/me/accounts/${accountId}`)
        .set('Authorization', auth(other.token))
        .expect(404);
      const settlementUrl = `/api/v1/admin/accounts/${accountId}/settlements`;
      const prepare = () =>
        request(http())
          .post(settlementUrl)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'settlement-create')
          .send({});
      await prepare().expect(409);
      await db.query(
        `INSERT INTO caja(id_jornada,monto_inicial_ctvs,abierta_por) VALUES ($1,0,$2) ON CONFLICT (id_jornada) DO NOTHING`,
        [dayId, users.admin],
      );
      await request(http())
        .post(settlementUrl)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'denied')
        .send({})
        .expect(403);
      const settlement = await prepare().expect(201);
      expect(settlement.body.totalCents).toBe(650);
      expect((await prepare().expect(201)).body).toEqual(settlement.body);
      await request(http())
        .get(`/api/v1/me/settlements/${settlement.body.id}`)
        .set('Authorization', auth(other.token))
        .expect(404);
      await request(http())
        .get(`/api/v1/me/settlements/${settlement.body.id}`)
        .set('Authorization', auth(guest.token))
        .expect(200);
      await request(http())
        .post(url)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'pending-block')
        .send({ items: [{ productId: product.id_producto, quantity: 1 }] })
        .expect(409);
      const cancelSettlement = () =>
        request(http())
          .post(`/api/v1/admin/settlements/${settlement.body.id}/cancel`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'settlement-cancel')
          .send({ reason: 'Corregir' });
      expect((await cancelSettlement().expect(200)).body.status).toBe(
        'cancelled',
      );
      await cancelSettlement().expect(200);
      const next = await request(http())
        .post(settlementUrl)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'settlement-again')
        .send({})
        .expect(201);
      expect(next.body.items[0].unitPriceCents).toBe(650);
      await request(http())
        .post(`/api/v1/admin/settlements/${next.body.id}/cancel`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'settlement-cancel-again')
        .send({ reason: 'Prueba' })
        .expect(200);
      await failAudit('settlement.created');
      try {
        await request(http())
          .post(settlementUrl)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'settlement-audit-fail')
          .send({})
          .expect(500);
      } finally {
        await restoreAudit();
      }
      const [pendingBefore] = await db.query(
        `SELECT count(*)::int AS n FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,
        [accountId],
      );
      expect(pendingBefore.n).toBe(0);
      const concurrent = await Promise.all(
        ['settle-race-1', 'settle-race-2'].map((key) =>
          request(http())
            .post(settlementUrl)
            .set('Authorization', auth(tokens.worker))
            .set('Idempotency-Key', key)
            .send({}),
        ),
      );
      expect(concurrent.map((result) => result.status).sort()).toEqual([
        201, 409,
      ]);
      const activeSettlement = concurrent.find(
        (result) => result.status === 201,
      )!.body.id;
      await request(http())
        .post(`/api/v1/admin/settlements/${activeSettlement}/cancel`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'settlement-cancel-race')
        .send({ reason: 'Prueba' })
        .expect(200);
      const [raceSettlement, raceOrder] = await Promise.all([
        request(http())
          .post(settlementUrl)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'settlement-vs-order')
          .send({}),
        request(http())
          .post(url)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', 'order-vs-settlement')
          .send({ items: [{ productId: product.id_producto, quantity: 1 }] }),
      ]);
      expect([raceSettlement.status, raceOrder.status].sort()).toEqual([
        201, 409,
      ]);
    });

    it('serializes orders for the last stock and rolls back when audit fails', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Concurrencia' });
      const participant = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'race-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Concurrencia' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${participant.body.id}/approve`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'race-approve')
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('Concurrencia test','concurrencia test') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs) VALUES ($1,'race-test','Producto',100) RETURNING id_producto`,
        [category.id_categoria],
      );
      await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,inicializado_por) VALUES ($1,$2,1,1,$3)`,
        [dayId, product.id_producto, users.admin],
      );
      const send = (key: string) =>
        request(http())
          .post(`/api/v1/visits/${f.visit.id}/orders`)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', key)
          .send({ items: [{ productId: product.id_producto, quantity: 1 }] });
      await failAudit('order.submitted');
      try {
        await send('audit-fail').expect(500);
      } finally {
        await restoreAudit();
      }
      const [before] = await db.query(
        'SELECT cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [product.id_producto],
      );
      expect(before.cantidad_reservada).toBe(0);
      const results = await Promise.all([send('race-one'), send('race-two')]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      const [after] = await db.query(
        'SELECT cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [product.id_producto],
      );
      expect(after.cantidad_reservada).toBe(1);
      const orderId = results.find((result) => result.status === 201)!.body.id;
      const cancel = () =>
        request(http())
          .post(`/api/v1/me/orders/${orderId}/cancel`)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', 'cancel-order')
          .send({ expectedVersion: 1, reason: 'Cambio de planes' });
      expect((await cancel().expect(200)).body.status).toBe('cancelled');
      await cancel().expect(200);
      const [released] = await db.query(
        'SELECT cantidad_fisica,cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [product.id_producto],
      );
      expect(released).toEqual({ cantidad_fisica: 1, cantidad_reservada: 0 });
      await request(http())
        .post(`/api/v1/me/participants/${participant.body.id}/leave`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'leave-after-cancel')
        .expect(200);
    });

    it('serializes cancellation against preparation', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Carrera' });
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'racer-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Carrera' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'racer-approve')
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('Carrera ciclo','carrera ciclo') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs) VALUES ($1,'racer-life','Producto',100) RETURNING id_producto`,
        [category.id_categoria],
      );
      await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,inicializado_por) VALUES ($1,$2,1,1,$3)`,
        [dayId, product.id_producto, users.admin],
      );
      const order = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/orders`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'racer-create')
        .send({ items: [{ productId: product.id_producto, quantity: 1 }] })
        .expect(201);
      const [cancel, prepare] = await Promise.all([
        request(http())
          .post(`/api/v1/me/orders/${order.body.id}/cancel`)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', 'racer-cancel')
          .send({ expectedVersion: 1, reason: 'Cambio' }),
        request(http())
          .post(`/api/v1/admin/orders/${order.body.id}/start-preparation`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'racer-start')
          .send({ expectedVersion: 1 }),
      ]);
      expect([cancel.status, prepare.status].sort()).toEqual([200, 409]);
      const [stock] = await db.query(
        'SELECT cantidad_fisica,cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [product.id_producto],
      );
      expect(stock.cantidad_reservada).toBe(0);
      expect(stock.cantidad_fisica).toBe(cancel.status === 200 ? 1 : 0);
    });

    it('configures coverage and reviews registered customer requests', async () => {
      const initial = await request(http())
        .get('/api/v1/delivery/settings')
        .expect(200);
      expect(initial.body.enabled).toBe(false);
      const guest = await guests.create({ name: 'Invitado domicilio' });
      const body = {
        configurationVersion: 1,
        recipientName: ' Cliente ',
        phone: '123',
        address: ' Calle 1 ',
      };
      await request(http())
        .post('/api/v1/me/delivery-requests')
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'guest-delivery')
        .send(body)
        .expect(401);
      await request(http())
        .post('/api/v1/me/delivery-requests')
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'worker-delivery')
        .send(body)
        .expect(403);
      await request(http())
        .put('/api/v1/admin/delivery/settings')
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'denied-delivery-settings')
        .send({
          enabled: true,
          coverageDescription: 'Centro',
          shippingFeeCents: 0,
        })
        .expect(403);
      const settingsBody = {
        enabled: true,
        coverageDescription: ' Centro ',
        shippingFeeCents: 0,
      };
      const configure = () =>
        request(http())
          .put('/api/v1/admin/delivery/settings')
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', 'delivery-settings')
          .send(settingsBody);
      const settings = await configure().expect(200);
      expect(settings.body.version).toBe(2);
      expect(settings.body.shippingFeeCents).toBe(0);
      expect((await configure().expect(200)).body).toEqual(settings.body);
      const submit = (payload: unknown, key: string) =>
        request(http())
          .post('/api/v1/me/delivery-requests')
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', key)
          .send(payload);
      await submit(
        { ...body, configurationVersion: 2, latitude: 1 },
        'bad-coordinates',
      ).expect(400);
      await submit({ ...body, configurationVersion: 1 }, 'old-settings').expect(
        409,
      );
      const created = await submit(
        { ...body, configurationVersion: 2 },
        'delivery-create',
      ).expect(201);
      expect(created.body.status).toBe('pending');
      expect(created.body.address).toBe('Calle 1');
      const [otherUser] = await db.query(
        `INSERT INTO usuario(id_rol,correo_normalizado,password_hash) SELECT id_rol,'delivery-other@test.invalid','test-unused-password-hash' FROM rol WHERE codigo='client' RETURNING id_usuario`,
      );
      await db.query('INSERT INTO cliente(id_usuario) VALUES ($1)', [
        otherUser.id_usuario,
      ]);
      const [otherSession] = await db.query(
        `INSERT INTO sesion_usuario(id_usuario,refresh_hash,expira_en) VALUES ($1,$2,now()+interval '1 day') RETURNING id_sesion_usuario`,
        [otherUser.id_usuario, hashAccessSecret(randomUUID())],
      );
      const otherToken = await app.get(JwtService).signAsync({
        sub: otherUser.id_usuario,
        sid: otherSession.id_sesion_usuario,
        av: 0,
      });
      await request(http())
        .get(`/api/v1/me/delivery-requests/${created.body.id}`)
        .set('Authorization', auth(otherToken))
        .expect(404);
      expect(
        (
          await submit(
            { ...body, configurationVersion: 2 },
            'delivery-create',
          ).expect(201)
        ).body,
      ).toEqual(created.body);
      await request(http())
        .get(
          `/api/v1/admin/delivery-requests?operatingDayId=${dayId}&status=pending&limit=1`,
        )
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      const approved = await request(http())
        .post(`/api/v1/admin/delivery-requests/${created.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'delivery-approve')
        .send({})
        .expect(200);
      expect(approved.body.usableToday).toBe(true);
      await request(http())
        .put('/api/v1/admin/delivery/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'delivery-settings-change')
        .send({
          enabled: true,
          coverageDescription: 'Centro',
          shippingFeeCents: 300,
        })
        .expect(200);
      const previous = await request(http())
        .get(`/api/v1/me/delivery-requests/${created.body.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(previous.body.usableToday).toBe(false);
      expect(previous.body.shippingFeeCents).toBe(0);
      await request(http())
        .post(`/api/v1/me/delivery-requests/${created.body.id}/cancel`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'delivery-cancel')
        .send({})
        .expect(200);
      const pending = await submit(
        { ...body, configurationVersion: 3, latitude: -0.5, longitude: -80.1 },
        'delivery-race-create',
      ).expect(201);
      await failAudit('delivery.approve');
      try {
        await request(http())
          .post(`/api/v1/admin/delivery-requests/${pending.body.id}/approve`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'delivery-audit-fail')
          .send({})
          .expect(500);
      } finally {
        await restoreAudit();
      }
      const afterFailure = await request(http())
        .get(`/api/v1/me/delivery-requests/${pending.body.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(afterFailure.body.status).toBe('pending');
      const [approve, cancel] = await Promise.all([
        request(http())
          .post(`/api/v1/admin/delivery-requests/${pending.body.id}/approve`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'delivery-race-approve')
          .send({}),
        request(http())
          .post(`/api/v1/me/delivery-requests/${pending.body.id}/cancel`)
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', 'delivery-race-cancel')
          .send({}),
      ]);
      expect([approve.status, cancel.status].sort()).toEqual(
        approve.status === 200 ? [200, 200] : [200, 409],
      );
      const stale = await submit(
        { ...body, configurationVersion: 3 },
        'delivery-stale-create',
      ).expect(201);
      await request(http())
        .put('/api/v1/admin/delivery/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'delivery-settings-stale')
        .send({
          enabled: true,
          coverageDescription: 'Nueva zona',
          shippingFeeCents: 400,
        })
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/delivery-requests/${stale.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'delivery-stale-approve')
        .send({})
        .expect(409);
      await request(http())
        .post(`/api/v1/admin/delivery-requests/${stale.body.id}/reject`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'delivery-stale-reject')
        .send({ reason: 'Cobertura actualizada' })
        .expect(200);
      const historic = await submit(
        { ...body, configurationVersion: 4 },
        'delivery-historic-create',
      ).expect(201);
      await db.query(
        'UPDATE jornada_operativa SET fecha_operativa=fecha_operativa-1 WHERE id_jornada=$1',
        [dayId],
      );
      try {
        await request(http())
          .post(`/api/v1/admin/delivery-requests/${historic.body.id}/approve`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'delivery-historic-approve')
          .send({})
          .expect(409);
        await request(http())
          .post(`/api/v1/admin/delivery-requests/${historic.body.id}/reject`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'delivery-historic-reject')
          .send({ reason: 'Jornada anterior' })
          .expect(200);
      } finally {
        await db.query(
          `UPDATE jornada_operativa SET fecha_operativa=timezone('America/Guayaquil',clock_timestamp())::date WHERE id_jornada=$1`,
          [dayId],
        );
      }
    });

    it('creates a normalized guest, stores only its hash and audits without secrets', async () => {
      const res = await request(http())
        .post('/api/v1/guest-sessions')
        .send({ name: '  Invitada  ', phone: ' 123 ' })
        .expect(201);
      expect(res.body.client.name).toBe('Invitada');
      expect(res.body.client.phone).toBe('123');
      expect(res.body.token).toMatch(/^guest_[A-Za-z0-9_-]{43}$/);
      const [session] = await db.query(
        'SELECT * FROM sesion_cliente WHERE id_sesion_cliente=$1',
        [res.body.sessionId],
      );
      expect(session.token_hash).toBe(hashAccessSecret(res.body.token));
      expect(
        new Date(session.expira_en).getTime() - Date.now(),
      ).toBeGreaterThan(86300000);
      const [audit] = await db.query(
        'SELECT * FROM auditoria WHERE recurso_id=$1',
        [res.body.sessionId],
      );
      expect(audit.actor_sesion_cliente_id).toBe(res.body.sessionId);
      expect(JSON.stringify(audit)).not.toContain(res.body.token);
      expect(JSON.stringify(audit)).not.toContain(session.token_hash);
    });

    it('rejects invalid bodies and unknown properties', async () => {
      for (const body of [
        { name: ' ' },
        { name: 12 },
        { name: 'Valid', phone: null },
        { name: 'Valid', clientId: randomUUID() },
      ]) {
        await request(http())
          .post('/api/v1/guest-sessions')
          .send(body)
          .expect(400);
      }
      await request(http())
        .post('/api/v1/admin/tables')
        .set('Authorization', auth(tokens.admin))
        .send({ code: 'M', extra: true })
        .expect(400);
      for (const query of [
        'page=0',
        'page=abc',
        'limit=101',
        'limit=1.5',
        'extra=x',
      ]) {
        await request(http())
          .get(`/api/v1/admin/tables?${query}`)
          .set('Authorization', auth(tokens.worker))
          .expect(400);
      }
      await request(http())
        .post('/api/v1/admin/tables/not-a-uuid/visits')
        .set('Authorization', auth(tokens.admin))
        .expect(400);
    });

    it('completes the HTTP flow without a cash register and enforces both identities and permissions', async () => {
      const table = await request(http())
        .post('/api/v1/admin/tables')
        .set('Authorization', auth(tokens.admin))
        .send({ code: ' http ' })
        .expect(201);
      const visit = await request(http())
        .post(`/api/v1/admin/tables/${table.body.id}/visits`)
        .set('Authorization', auth(tokens.worker))
        .expect(201);
      const qr = await request(http())
        .post(`/api/v1/admin/visits/${visit.body.id}/qr`)
        .set('Authorization', auth(tokens.worker))
        .expect(201);
      const guest = await guests.create({ name: 'Guest' });
      for (const token of [guest.token, tokens.client]) {
        const resolved = await request(http())
          .post('/api/v1/table-access/resolve')
          .set('Authorization', auth(token))
          .send({ qrToken: qr.body.qrToken })
          .expect(200);
        expect(resolved.body).toEqual({
          visitId: visit.body.id,
          tableId: table.body.id,
          tableCode: 'HTTP',
          qrVersion: qr.body.qrVersion,
        });
      }
      await request(http())
        .post('/api/v1/table-access/resolve')
        .send({ qrToken: qr.body.qrToken })
        .expect(401);
      await request(http())
        .post('/api/v1/table-access/resolve')
        .set('Authorization', auth(tokens.admin))
        .send({ qrToken: qr.body.qrToken })
        .expect(403);
      await request(http())
        .post('/api/v1/table-access/resolve')
        .set('Authorization', auth(guest.token))
        .send({ qrToken: qr.body.qrToken, clientId: randomUUID() })
        .expect(400);
      await request(http())
        .get('/api/v1/admin/tables')
        .set('Authorization', auth(guest.token))
        .expect(401);
      await request(http())
        .get('/api/v1/admin/tables')
        .set('Authorization', auth(tokens.client))
        .expect(403);
      await request(http())
        .post('/api/v1/admin/tables')
        .set('Authorization', auth(tokens.worker))
        .send({ code: 'WORKER' })
        .expect(403);
      const page = await request(http())
        .get('/api/v1/admin/tables?page=1&limit=1')
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.limit).toBe(1);
      await request(http())
        .delete('/api/v1/guest-sessions/current')
        .set('Authorization', auth(tokens.client))
        .expect(401);
      await request(http())
        .delete('/api/v1/guest-sessions/current')
        .set('Authorization', auth(guest.token))
        .expect(204);
      await request(http())
        .delete('/api/v1/guest-sessions/current')
        .set('Authorization', auth(guest.token))
        .expect(401);
      await request(http())
        .post('/api/v1/table-access/resolve')
        .set('Authorization', auth(guest.token))
        .send({ qrToken: qr.body.qrToken })
        .expect(401);
      const expired = await guests.create({ name: 'Expired' });
      await db.query(
        `UPDATE sesion_cliente SET creada_en=now()-interval '2 days',expira_en=now()-interval '1 day' WHERE id_sesion_cliente=$1`,
        [expired.sessionId],
      );
      await request(http())
        .post('/api/v1/table-access/resolve')
        .set('Authorization', auth(expired.token))
        .send({ qrToken: qr.body.qrToken })
        .expect(401);
      await request(http())
        .delete('/api/v1/guest-sessions/current')
        .set('Authorization', auth(`guest_${'a'.repeat(43)}`))
        .expect(401);
      const expiredJwt = await app
        .get(JwtService)
        .signAsync(
          { sub: users.client, sid: randomUUID(), av: 0 },
          { expiresIn: -1 },
        );
      await request(http())
        .post('/api/v1/table-access/resolve')
        .set('Authorization', auth(expiredJwt))
        .send({ qrToken: qr.body.qrToken })
        .expect(401);
      await db.query('UPDATE usuario SET activo=false WHERE id_usuario=$1', [
        users.client,
      ]);
      try {
        await request(http())
          .post('/api/v1/table-access/resolve')
          .set('Authorization', auth(tokens.client))
          .send({ qrToken: qr.body.qrToken })
          .expect(401);
      } finally {
        await db.query('UPDATE usuario SET activo=true WHERE id_usuario=$1', [
          users.client,
        ]);
      }
    });

    it('serializes QR renewal, invalidates old versions, cancels pending and preserves approved', async () => {
      const { visit, qr } = await fixture();
      const a = await guests.create({ name: 'Pending' });
      const b = await guests.create({ name: 'Approved' });
      await db.query(
        `INSERT INTO participante (id_visita,id_cliente,alias,estado,qr_version_aprobada) VALUES ($1,$2,'Pending','pending',$3),($1,$4,'Approved','approved',$3)`,
        [visit.id, a.client.id, qr.qrVersion, b.client.id],
      );
      const renewals = await Promise.all([
        tables.issueQr(visit.id, users.worker),
        tables.issueQr(visit.id, users.admin),
      ]);
      expect(renewals.map((r) => r.qrVersion).sort()).toEqual([
        qr.qrVersion + 1,
        qr.qrVersion + 2,
      ]);
      const latest = renewals.reduce((a, b) =>
        a.qrVersion > b.qrVersion ? a : b,
      );
      await expect(access.resolveQr(qr.qrToken)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        access.resolveQr(renewals.find((r) => r !== latest)!.qrToken),
      ).rejects.toMatchObject({ status: 404 });
      expect((await access.resolveQr(latest.qrToken)).visitId).toBe(visit.id);
      const states = await db.query(
        'SELECT estado FROM participante WHERE id_visita=$1 ORDER BY estado',
        [visit.id],
      );
      expect(states.map((s) => s.estado)).toEqual(['approved', 'cancelled']);
    });

    it('rejects inactive tables, closed days and stale business dates', async () => {
      const { table, visit, qr } = await fixture();
      const guest = await guests.create({ name: 'Operational' });
      for (const mutate of [
        () =>
          db.query('UPDATE mesa SET activa=false WHERE id_mesa=$1', [table.id]),
        () =>
          db.query(
            `UPDATE jornada_operativa SET fecha_operativa=fecha_operativa-1 WHERE id_jornada=$1`,
            [dayId],
          ),
      ]) {
        await mutate();
        try {
          await request(http())
            .post('/api/v1/table-access/resolve')
            .set('Authorization', auth(guest.token))
            .send({ qrToken: qr.qrToken })
            .expect(409);
          await request(http())
            .post(`/api/v1/admin/visits/${visit.id}/qr`)
            .set('Authorization', auth(tokens.admin))
            .expect(409);
        } finally {
          await db.query('UPDATE mesa SET activa=true WHERE id_mesa=$1', [
            table.id,
          ]);
          await db.query(
            `UPDATE jornada_operativa SET fecha_operativa=timezone('America/Guayaquil',clock_timestamp())::date WHERE id_jornada=$1`,
            [dayId],
          );
        }
      }
      await db.query(
        `UPDATE visita_mesa SET estado='closed',cerrada_en=now(),cerrada_por=$2 WHERE id_visita=$1`,
        [visit.id, users.admin],
      );
      await expect(access.resolveQr(qr.qrToken)).rejects.toMatchObject({
        status: 404,
      });
      await tables.openVisit(table.id, users.admin);
      const [m] = await db.query('SELECT qr_hash FROM mesa WHERE id_mesa=$1', [
        table.id,
      ]);
      expect(m.qr_hash).toBeNull();
      await expect(access.resolveQr(qr.qrToken)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rolls back QR renewal and pending cancellation when audit fails', async () => {
      const { visit, qr } = await fixture();
      const guest = await guests.create({ name: 'Pending rollback' });
      await db.query(
        `INSERT INTO participante (id_visita,id_cliente,alias) VALUES ($1,$2,'Pending')`,
        [visit.id, guest.client.id],
      );
      await failAudit('visit.qr_issued');
      try {
        await expect(tables.issueQr(visit.id, users.admin)).rejects.toThrow(
          'test audit failure',
        );
      } finally {
        await restoreAudit();
      }
      expect((await access.resolveQr(qr.qrToken)).qrVersion).toBe(qr.qrVersion);
      const [p] = await db.query(
        'SELECT estado FROM participante WHERE id_visita=$1',
        [visit.id],
      );
      expect(p.estado).toBe('pending');
    });

    it('uses the configured time zone when the operational date changes', async () => {
      const { visit, qr } = await fixture();
      await db.query(
        `UPDATE configuracion_operativa SET zona_horaria='Etc/GMT+12'`,
      );
      await db.query(
        `UPDATE jornada_operativa SET fecha_operativa=timezone('Etc/GMT-14',clock_timestamp())::date WHERE id_jornada=$1`,
        [dayId],
      );
      try {
        await expect(access.resolveQr(qr.qrToken)).rejects.toMatchObject({
          status: 409,
        });
        await expect(
          tables.issueQr(visit.id, users.admin),
        ).rejects.toMatchObject({ status: 409 });
      } finally {
        await db.query(
          `UPDATE configuracion_operativa SET zona_horaria='America/Guayaquil'`,
        );
        await db.query(
          `UPDATE jornada_operativa SET fecha_operativa=timezone('America/Guayaquil',clock_timestamp())::date WHERE id_jornada=$1`,
          [dayId],
        );
      }
    });

    it('serializes visit opening and rolls back opening and QR invalidation if audit fails', async () => {
      const table = await tables.createTable(`M${++counter}`, users.admin);
      const originalHash = hashAccessSecret('previous-visit-token');
      await db.query('UPDATE mesa SET qr_hash=$2 WHERE id_mesa=$1', [
        table.id,
        originalHash,
      ]);
      await failAudit('visit.opened');
      try {
        await expect(tables.openVisit(table.id, users.admin)).rejects.toThrow(
          'test audit failure',
        );
      } finally {
        await restoreAudit();
      }
      const [m] = await db.query('SELECT qr_hash FROM mesa WHERE id_mesa=$1', [
        table.id,
      ]);
      expect(m.qr_hash).toBe(originalHash);
      const [{ total }] = await db.query(
        'SELECT count(*)::int AS total FROM visita_mesa WHERE id_mesa=$1',
        [table.id],
      );
      expect(total).toBe(0);
      const opened = await Promise.allSettled([
        tables.openVisit(table.id, users.admin),
        tables.openVisit(table.id, users.worker),
      ]);
      expect(opened.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(opened.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { status: 409 },
      });
    });

    it('rolls back guest creation and revocation when audit fails', async () => {
      const [{ count: before }] = await db.query(
        'SELECT count(*)::int AS count FROM cliente',
      );
      await failAudit('guest_session.created');
      try {
        await expect(guests.create({ name: 'Rollback' })).rejects.toThrow(
          'test audit failure',
        );
      } finally {
        await restoreAudit();
      }
      const [{ count: after }] = await db.query(
        'SELECT count(*)::int AS count FROM cliente',
      );
      expect(after).toBe(before);
      const guest = await guests.create({ name: 'Revocation rollback' });
      const identity = await guests.authenticate(guest.token);
      await failAudit('guest_session.revoked');
      try {
        await expect(guests.revoke(identity)).rejects.toThrow(
          'test audit failure',
        );
      } finally {
        await restoreAudit();
      }
      await expect(guests.authenticate(guest.token)).resolves.toEqual(identity);
    });

    it('requests, approves and closes accounts with idempotency and ownership checks', async () => {
      const { table, visit, qr } = await fixture();
      const guest = await guests.create({ name: 'Participant' });
      const other = await guests.create({ name: 'Other' });
      const route = `/api/v1/visits/${visit.id}/participants`;
      const body = { qrToken: qr.qrToken, alias: '  Invitado  ' };
      await request(http())
        .post(route)
        .set('Authorization', auth(guest.token))
        .send(body)
        .expect(400);
      const requested = await request(http())
        .post(route)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'request-1')
        .send(body)
        .expect(201);
      expect(requested.body.status).toBe('pending');
      expect(requested.body.alias).toBe('Invitado');
      expect(requested.body.account).toBeNull();
      const replay = await request(http())
        .post(route)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'request-1')
        .send(body)
        .expect(201);
      expect(replay.body).toEqual(requested.body);
      await request(http())
        .post(route)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'request-1')
        .send({ ...body, alias: 'Changed' })
        .expect(409);
      await request(http())
        .post(route)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'request-2')
        .send(body)
        .expect(409);
      const p = requested.body.id;
      await request(http())
        .get(`/api/v1/me/participants/${p}`)
        .set('Authorization', auth(other.token))
        .expect(404);
      await request(http())
        .post(`/api/v1/me/participants/${p}/leave`)
        .set('Authorization', auth(other.token))
        .set('Idempotency-Key', 'leave-other')
        .expect(404);
      await request(http())
        .post(`/api/v1/admin/participants/${p}/approve`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'approve')
        .expect(403);
      await request(http())
        .post(`/api/v1/admin/participants/${p}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'approve')
        .send({ clientId: randomUUID() })
        .expect(400);
      const approved = await request(http())
        .post(`/api/v1/admin/participants/${p}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'approve')
        .expect(200);
      expect(approved.body.status).toBe('approved');
      expect(approved.body.account.status).toBe('open');
      const again = await request(http())
        .post(`/api/v1/admin/participants/${p}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'approve')
        .expect(200);
      expect(again.body).toEqual(approved.body);
      const own = await request(http())
        .get('/api/v1/me/participants?status=approved')
        .set('Authorization', auth(guest.token))
        .expect(200);
      expect(own.body.items).toHaveLength(1);
      expect(own.body.items[0].account.id).toBe(approved.body.account.id);
      const visits = await request(http())
        .get(`/api/v1/admin/visits?tableId=${table.id}`)
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      expect(visits.body.total).toBe(1);
      await request(http())
        .get(`/api/v1/admin/visits/${visit.id}/participants`)
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      await request(http())
        .patch(`/api/v1/admin/tables/${table.id}`)
        .set('Authorization', auth(tokens.admin))
        .send({ active: false })
        .expect(409);
      await request(http())
        .get(`/api/v1/admin/tables/${table.id}`)
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      const left = await request(http())
        .post(`/api/v1/me/participants/${p}/leave`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'leave-1')
        .expect(200);
      expect(left.body.status).toBe('finished');
      expect(left.body.account.status).toBe('closed');
      await request(http())
        .post(`/api/v1/me/participants/${p}/leave`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'leave-2')
        .expect(409);
      const closed = await request(http())
        .post(`/api/v1/admin/visits/${visit.id}/close`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'close')
        .expect(200);
      expect(closed.body.status).toBe('closed');
      await request(http())
        .post(`/api/v1/admin/visits/${visit.id}/close`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'close')
        .expect(200);
      await request(http())
        .patch(`/api/v1/admin/tables/${table.id}`)
        .set('Authorization', auth(tokens.admin))
        .send({ active: false })
        .expect(200);
      const [{ n }] = await db.query(
        `SELECT count(*)::int AS n FROM cuenta_consumo WHERE id_participante=$1`,
        [p],
      );
      expect(n).toBe(1);
      const audits = await db.query(
        'SELECT detalle FROM auditoria WHERE recurso_id=$1',
        [p],
      );
      expect(JSON.stringify(audits)).not.toContain(qr.qrToken);
    });

    it('permits registered customers and prevents concurrent approvals at multiple tables', async () => {
      const a = await fixture();
      const b = await fixture();
      async function ask(f: typeof a, key: string) {
        return request(http())
          .post(`/api/v1/visits/${f.visit.id}/participants`)
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', key)
          .send({ qrToken: f.qr.qrToken, alias: 'Cliente' })
          .expect(201);
      }
      const [p1, p2] = await Promise.all([ask(a, 'ask-a'), ask(b, 'ask-b')]);
      const approvals = await Promise.all(
        [p1, p2].map((p, i) =>
          request(http())
            .post(`/api/v1/admin/participants/${p.body.id}/approve`)
            .set('Authorization', auth(tokens.admin))
            .set('Idempotency-Key', `approve-${i}`),
        ),
      );
      expect(approvals.map((r) => r.status).sort()).toEqual([200, 409]);
      for (const f of [a, b])
        await request(http())
          .post(`/api/v1/admin/visits/${f.visit.id}/close`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', `close-${f.visit.id}`)
          .expect(200);
    });

    it('rolls back approval and account creation if audit fails', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Rollback participant' });
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'rollback-ask')
        .send({ qrToken: f.qr.qrToken, alias: 'Guest' })
        .expect(201);
      await failAudit('participant.approve');
      try {
        await request(http())
          .post(`/api/v1/admin/participants/${p.body.id}/approve`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', 'rollback-approve')
          .expect(500);
      } finally {
        await restoreAudit();
      }
      const [row] = await db.query(
        'SELECT estado FROM participante WHERE id_participante=$1',
        [p.body.id],
      );
      expect(row.estado).toBe('pending');
      const [{ n }] = await db.query(
        'SELECT count(*)::int AS n FROM cuenta_consumo WHERE id_participante=$1',
        [p.body.id],
      );
      expect(n).toBe(0);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'rollback-approve')
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/visits/${f.visit.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'rollback-close')
        .expect(200);
    });

    it('rejects expired guests, rotated QR, invalid input and terminal transitions', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Expired participant' });
      const path = `/api/v1/visits/${f.visit.id}/participants`;
      await request(http())
        .post(path)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'invalid')
        .send({ qrToken: f.qr.qrToken, alias: ' ', clientId: randomUUID() })
        .expect(400);
      const p = await request(http())
        .post(path)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'expiry-ask')
        .send({ qrToken: f.qr.qrToken, alias: 'Guest' })
        .expect(201);
      await db.query(
        `UPDATE sesion_cliente SET creada_en=now()-interval '2 days',expira_en=now()-interval '1 day' WHERE id_sesion_cliente=$1`,
        [guest.sessionId],
      );
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'expired-approve')
        .expect(409);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/reject`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'reject')
        .send({ reason: ' ' })
        .expect(400);
      const rejected = await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/reject`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'reject')
        .send({ reason: ' no disponible ' })
        .expect(200);
      expect(rejected.body.status).toBe('rejected');
      expect(rejected.body.rejectionReason).toBe('no disponible');
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/finish`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'finish-rejected')
        .expect(409);
      const fresh = await guests.create({ name: 'QR rotation' });
      const pending = await request(http())
        .post(path)
        .set('Authorization', auth(fresh.token))
        .set('Idempotency-Key', 'rotate-ask')
        .send({ qrToken: f.qr.qrToken, alias: 'Guest' })
        .expect(201);
      await tables.issueQr(f.visit.id, users.admin);
      await request(http())
        .post(`/api/v1/admin/participants/${pending.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'rotated-approve')
        .expect(409);
      const [cancelled] = await db.query(
        'SELECT estado FROM participante WHERE id_participante=$1',
        [pending.body.id],
      );
      expect(cancelled.estado).toBe('cancelled');
      await request(http())
        .post(`/api/v1/admin/visits/${f.visit.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'expiry-close')
        .expect(200);
    });

    it('serializes approval against QR rotation and visit closure', async () => {
      for (const competingAction of ['qr', 'close']) {
        const f = await fixture();
        const guest = await guests.create({ name: 'Concurrent' });
        const p = await request(http())
          .post(`/api/v1/visits/${f.visit.id}/participants`)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', 'ask')
          .send({ qrToken: f.qr.qrToken, alias: 'Guest' })
          .expect(201);
        const approvals = request(http())
          .post(`/api/v1/admin/participants/${p.body.id}/approve`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'approve-race');
        const competing = request(http())
          .post(`/api/v1/admin/visits/${f.visit.id}/${competingAction}`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', 'close-race');
        const [approval, operation] = await Promise.all([approvals, competing]);
        expect([200, 409]).toContain(approval.status);
        expect(competingAction === 'qr' ? 201 : 200).toBe(operation.status);
        const [row] = await db.query(
          `SELECT p.estado,c.estado AS account_status FROM participante p LEFT JOIN cuenta_consumo c ON c.id_participante=p.id_participante WHERE p.id_participante=$1`,
          [p.body.id],
        );
        if (competingAction === 'close') {
          expect(['cancelled', 'finished']).toContain(row.estado);
          if (row.account_status) expect(row.account_status).toBe('closed');
        } else {
          expect(['cancelled', 'approved']).toContain(row.estado);
          await request(http())
            .post(`/api/v1/admin/visits/${f.visit.id}/close`)
            .set('Authorization', auth(tokens.admin))
            .set('Idempotency-Key', 'after-rotation')
            .expect(200);
        }
      }
    });

    it('finishes and closes visits from previous operating dates', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Previous date' });
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'historical-ask')
        .send({ qrToken: f.qr.qrToken, alias: 'Guest' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'historical-approve')
        .expect(200);
      await db.query(
        'UPDATE jornada_operativa SET fecha_operativa=fecha_operativa-1 WHERE id_jornada=$1',
        [dayId],
      );
      try {
        const finish = await request(http())
          .post(`/api/v1/admin/participants/${p.body.id}/finish`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'historical-finish')
          .expect(200);
        expect(finish.body.status).toBe('finished');
        expect(finish.body.account.status).toBe('closed');
        await request(http())
          .post(`/api/v1/admin/visits/${f.visit.id}/close`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'historical-close')
          .expect(200);
      } finally {
        await db.query(
          `UPDATE jornada_operativa SET fecha_operativa=timezone('America/Guayaquil',clock_timestamp())::date WHERE id_jornada=$1`,
          [dayId],
        );
      }
    });

    it('deduplicates simultaneous requests and revalidates revoked guest sessions before replay', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Concurrent request' });
      const path = `/api/v1/visits/${f.visit.id}/participants`;
      const submit = () =>
        request(http())
          .post(path)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', 'same-key')
          .send({ qrToken: f.qr.qrToken, alias: 'Guest' });
      const [first, second] = await Promise.all([submit(), submit()]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body).toEqual(second.body);
      const [{ n }] = await db.query(
        `SELECT count(*)::int AS n FROM participante WHERE id_visita=$1 AND id_cliente=$2`,
        [f.visit.id, guest.client.id],
      );
      expect(n).toBe(1);
      await request(http())
        .delete('/api/v1/guest-sessions/current')
        .set('Authorization', auth(guest.token))
        .expect(204);
      expect((await submit()).status).toBe(401);
      await request(http())
        .post(`/api/v1/admin/visits/${f.visit.id}/close`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'close-pending')
        .expect(200);
      const [row] = await db.query(
        `SELECT estado FROM participante WHERE id_participante=$1`,
        [first.body.id],
      );
      expect(row.estado).toBe('cancelled');
    });

    it('documents security schemes and limits guest creation requests', async () => {
      const docs = await request(http()).get('/docs-json').expect(200);
      expect(
        docs.body.paths['/api/v1/table-access/resolve'].post.security,
      ).toEqual([{ 'client-token': [] }]);
      expect(
        docs.body.paths['/api/v1/guest-sessions/current'].delete.security,
      ).toEqual([{ 'client-token': [] }]);
      expect(
        docs.body.paths['/api/v1/visits/{id}/participants'].post.security,
      ).toEqual([{ 'client-token': [] }]);
      expect(
        docs.body.paths['/api/v1/admin/refunds/{id}/execute'].post.security,
      ).toEqual([{ 'access-token': [] }]);
      expect(
        docs.body.paths['/api/v1/admin/operations/cash/{id}/summary'].get,
      ).toBeDefined();
      expect(
        docs.body.paths['/api/v1/admin/operations/cash'].get,
      ).toBeDefined();
      expect(
        docs.body.paths['/api/v1/admin/operations/cash/{id}/closing-preview']
          .get,
      ).toBeDefined();
      expect(
        docs.body.paths[
          '/api/v1/admin/operations/cash/{id}/close'
        ].post.parameters.some(
          (p: { name: string }) => p.name === 'Idempotency-Key',
        ),
      ).toBe(true);
      expect(
        docs.body.paths['/api/v1/admin/operations/cash/{id}/closure'].get,
      ).toBeDefined();
      expect(
        docs.body.paths['/api/v1/admin/operations/days/{id}/closing-preview']
          .get,
      ).toBeDefined();
      expect(
        docs.body.paths[
          '/api/v1/admin/operations/days/{id}/close'
        ].post.parameters.some(
          (p: { name: string }) => p.name === 'Idempotency-Key',
        ),
      ).toBe(true);
      expect(
        docs.body.paths['/api/v1/admin/operations/days/open-with-pending-days']
          .post,
      ).toBeDefined();
      expect(docs.body.paths['/api/v1/me/refunds/{id}'].get.security).toEqual([
        { 'client-token': [] },
      ]);
      let limited = 0;
      for (let i = 0; i < 11; i++) {
        const response = await request(http())
          .post('/api/v1/guest-sessions')
          .send({ name: 'Rate test' });
        expect([201, 429]).toContain(response.status);
        if (response.status === 429) limited++;
      }
      expect(limited).toBeGreaterThan(0);
    });
    it('serializes cash collection against cancellation without duplicate income', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Carrera de pago' });
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'payment-race-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Carrera' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'payment-race-approve')
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('Carrera pago','carrera pago') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'payment-race-product','Producto',500,false) RETURNING id_producto`,
        [category.id_categoria],
      );
      const order = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/orders`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'payment-race-order')
        .send({ items: [{ productId: product.id_producto, quantity: 1 }] })
        .expect(201);
      for (const action of ['start-preparation', 'ready', 'deliver'])
        await request(http())
          .post(`/api/v1/admin/orders/${order.body.id}/${action}`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', `payment-race-${action}`)
          .send({ expectedVersion: 1 })
          .expect(200);
      const settlement = await request(http())
        .post(`/api/v1/admin/accounts/${order.body.accountId}/settlements`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'payment-race-settlement')
        .send({})
        .expect(201);
      const [pay, cancel] = await Promise.all([
        request(http())
          .post(`/api/v1/admin/settlements/${settlement.body.id}/cash-payments`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'payment-race-pay')
          .send({ receivedCents: 500 }),
        request(http())
          .post(`/api/v1/admin/settlements/${settlement.body.id}/cancel`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'payment-race-cancel')
          .send({ reason: 'Error' }),
      ]);
      expect([pay.status, cancel.status].sort((a, b) => a - b)).toEqual(
        cancel.status === 200 ? [200, 409] : [201, 409],
      );
      const [saved] = await db.query(
        `SELECT l.estado,(SELECT count(*)::int FROM pago WHERE id_liquidacion=l.id_liquidacion) AS payments FROM liquidacion l WHERE l.id_liquidacion=$1`,
        [settlement.body.id],
      );
      expect(saved.estado).toBe(pay.status === 201 ? 'settled' : 'cancelled');
      expect(saved.payments).toBe(pay.status === 201 ? 1 : 0);
    });

    it('registers, rejects and confirms private transfer receipts', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Transferencia' });
      const other = await guests.create({ name: 'Otro' });
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'transfer-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Transferencia' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-approve')
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('Transfer test','transfer test') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'transfer-product','Producto',500,false) RETURNING id_producto`,
        [category.id_categoria],
      );
      const order = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/orders`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'transfer-order')
        .send({ items: [{ productId: product.id_producto, quantity: 1 }] })
        .expect(201);
      for (const action of ['start-preparation', 'ready', 'deliver'])
        await request(http())
          .post(`/api/v1/admin/orders/${order.body.id}/${action}`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', `transfer-${action}`)
          .send({ expectedVersion: 1 })
          .expect(200);
      const settlement = await request(http())
        .post(`/api/v1/admin/accounts/${order.body.accountId}/settlements`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-settlement')
        .send({})
        .expect(201);
      const url = `/api/v1/me/settlements/${settlement.body.id}/transfer-payments`;
      const pdf = Buffer.from('%PDF-1.7\nexample');
      const upload = (key: string) =>
        request(http())
          .post(url)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', key)
          .attach('file', pdf, {
            filename: 'receipt.pdf',
            contentType: 'application/pdf',
          });
      await request(http())
        .post(url)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'bad-type')
        .attach('file', Buffer.from('not a pdf'), {
          filename: 'fake.pdf',
          contentType: 'application/pdf',
        })
        .expect(415);
      const beforeObjects = receiptObjects.size;
      receiptUnavailable = true;
      try {
        await upload('storage-unavailable').expect(503);
      } finally {
        receiptUnavailable = false;
      }
      expect(receiptObjects.size).toBe(beforeObjects);
      await failAudit('transfer.submitted');
      try {
        await upload('failed-transfer').expect(500);
      } finally {
        await restoreAudit();
      }
      expect(receiptObjects.size).toBe(beforeObjects);
      const [failed] = await db.query(
        `SELECT count(*)::int AS count FROM pago WHERE id_liquidacion=$1`,
        [settlement.body.id],
      );
      expect(failed.count).toBe(0);
      const first = await upload('transfer-upload').expect(201);
      expect((await upload('transfer-upload').expect(201)).body).toEqual(
        first.body,
      );
      await request(http())
        .post(url)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'transfer-upload')
        .attach('file', Buffer.from('%PDF-1.7\ndifferent'), {
          filename: 'receipt.pdf',
          contentType: 'application/pdf',
        })
        .expect(409);
      await request(http())
        .get(`/api/v1/me/payments/${first.body.id}/receipt`)
        .set('Authorization', auth(other.token))
        .expect(404);
      await request(http())
        .get(`/api/v1/me/payments/${first.body.id}/receipt`)
        .set('Authorization', auth(guest.token))
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/settlements/${settlement.body.id}/cash-payments`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-block')
        .send({ receivedCents: 500 })
        .expect(409);
      await request(http())
        .post(`/api/v1/admin/settlements/${settlement.body.id}/cancel`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-cancel-block')
        .send({ reason: 'Prueba' })
        .expect(409);
      await request(http())
        .post(`/api/v1/admin/payments/${first.body.id}/confirm`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'forbidden-confirm')
        .send({ bankOperationReference: 'XYZ' })
        .expect(403);
      await request(http())
        .post(`/api/v1/admin/payments/${first.body.id}/reject`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-reject')
        .send({ reason: 'No aparece' })
        .expect(200);
      const second = await upload('transfer-upload-2').expect(201);
      const confirm = () =>
        request(http())
          .post(`/api/v1/admin/payments/${second.body.id}/confirm`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'transfer-confirm')
          .send({ bankOperationReference: '  abc-123  ' });
      const [confirmed, rejected] = await Promise.all([
        confirm(),
        request(http())
          .post(`/api/v1/admin/payments/${second.body.id}/reject`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'transfer-race-reject')
          .send({ reason: 'Carrera' }),
      ]);
      expect([confirmed.status, rejected.status].sort()).toEqual([200, 409]);
      if (confirmed.status === 200) await confirm().expect(200);
      else {
        const third = await upload('transfer-upload-3').expect(201);
        await request(http())
          .post(`/api/v1/admin/payments/${third.body.id}/confirm`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'transfer-confirm-3')
          .send({ bankOperationReference: 'abc-123' })
          .expect(200);
      }
      const list = await request(http())
        .get('/api/v1/me/payments?method=transfer&status=confirmed')
        .set('Authorization', auth(guest.token))
        .expect(200);
      expect(list.body.total).toBe(1);
      const account = await request(http())
        .get(`/api/v1/me/accounts/${order.body.accountId}`)
        .set('Authorization', auth(guest.token))
        .expect(200);
      expect(account.body.paidCents).toBe(500);
      expect(account.body.pendingCents).toBe(0);
      const f2 = await fixture();
      const guest2 = await guests.create({ name: 'Referencia repetida' });
      const p2 = await request(http())
        .post(`/api/v1/visits/${f2.visit.id}/participants`)
        .set('Authorization', auth(guest2.token))
        .set('Idempotency-Key', 'transfer-dup-participant')
        .send({ qrToken: f2.qr.qrToken, alias: 'Otra' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p2.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-dup-approve')
        .expect(200);
      const o2 = await request(http())
        .post(`/api/v1/visits/${f2.visit.id}/orders`)
        .set('Authorization', auth(guest2.token))
        .set('Idempotency-Key', 'transfer-dup-order')
        .send({ items: [{ productId: product.id_producto, quantity: 1 }] })
        .expect(201);
      for (const action of ['start-preparation', 'ready', 'deliver'])
        await request(http())
          .post(`/api/v1/admin/orders/${o2.body.id}/${action}`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', `transfer-dup-${action}`)
          .send({ expectedVersion: 1 })
          .expect(200);
      const s2 = await request(http())
        .post(`/api/v1/admin/accounts/${o2.body.accountId}/settlements`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-dup-settlement')
        .send({})
        .expect(201);
      const t2 = await request(http())
        .post(`/api/v1/admin/settlements/${s2.body.id}/transfer-payments`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-staff-upload')
        .attach('file', pdf, {
          filename: 'receipt.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/payments/${t2.body.id}/confirm`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-duplicate-reference')
        .send({ bankOperationReference: 'abc-123' })
        .expect(409);
      await request(http())
        .post(`/api/v1/admin/payments/${t2.body.id}/confirm`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'transfer-unique-reference')
        .send({ bankOperationReference: 'xyz-456' })
        .expect(200);
    });

    it('closes a zero-total settlement without inserting a payment', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Cortesía' });
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'zero-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Cortesía' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'zero-approve')
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('Gratis','gratis') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'free-product','Cortesía',0,false) RETURNING id_producto`,
        [category.id_categoria],
      );
      const order = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/orders`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', 'zero-order')
        .send({ items: [{ productId: product.id_producto, quantity: 1 }] })
        .expect(201);
      for (const action of ['start-preparation', 'ready', 'deliver'])
        await request(http())
          .post(`/api/v1/admin/orders/${order.body.id}/${action}`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', `zero-${action}`)
          .send({ expectedVersion: 1 })
          .expect(200);
      const settlement = await request(http())
        .post(`/api/v1/admin/accounts/${order.body.accountId}/settlements`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'zero-settlement')
        .send({})
        .expect(201);
      const close = () =>
        request(http())
          .post(
            `/api/v1/admin/settlements/${settlement.body.id}/complete-without-payment`,
          )
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'zero-close')
          .send({});
      expect((await close().expect(200)).body.payment).toBeNull();
      await close().expect(200);
      const [{ count }] = await db.query(
        'SELECT count(*)::int AS count FROM pago WHERE id_liquidacion=$1',
        [settlement.body.id],
      );
      expect(count).toBe(0);
      await request(http())
        .post(`/api/v1/admin/visits/${f.visit.id}/close`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'zero-close-visit')
        .expect(200);
    });

    it('creates an order for a registered customer and preserves its price', async () => {
      const f = await fixture();
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'registered-order-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Cliente' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'registered-order-approve')
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('Cliente test','cliente test') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'registered-order-test','Producto',250,false) RETURNING id_producto`,
        [category.id_categoria],
      );
      const body = { items: [{ productId: product.id_producto, quantity: 2 }] };
      const order = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/orders`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'registered-order')
        .send(body)
        .expect(201);
      await db.query(
        'UPDATE producto SET precio_ctvs=500 WHERE id_producto=$1',
        [product.id_producto],
      );
      const own = await request(http())
        .get(`/api/v1/me/orders/${order.body.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(own.body.totalCents).toBe(500);
      expect(own.body.items[0].unitPriceCents).toBe(250);
      await request(http())
        .get('/api/v1/admin/orders')
        .set('Authorization', auth(tokens.client))
        .expect(403);
      await request(http())
        .get('/api/v1/me/orders?limit=0')
        .set('Authorization', auth(tokens.client))
        .expect(400);
      const accountId = order.body.accountId;
      const ownAccount = await request(http())
        .get(`/api/v1/me/accounts/${accountId}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(ownAccount.body.totalCents).toBe(500);
      await request(http())
        .get('/api/v1/me/accounts?status=invalid')
        .set('Authorization', auth(tokens.client))
        .expect(400);
      await request(http())
        .post(`/api/v1/admin/accounts/${accountId}/settlements`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'unfinished-settlement')
        .send({})
        .expect(409);
      for (const action of ['start-preparation', 'ready', 'deliver'])
        await request(http())
          .post(`/api/v1/admin/orders/${order.body.id}/${action}`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', `registered-${action}`)
          .send({ expectedVersion: 1 })
          .expect(200);
      const result = await request(http())
        .post(`/api/v1/admin/accounts/${accountId}/settlements`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'registered-settlement')
        .send({})
        .expect(201);
      const ownSettlement = await request(http())
        .get(`/api/v1/me/settlements/${result.body.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(ownSettlement.body.totalCents).toBe(500);
      const accounts = await request(http())
        .get(
          `/api/v1/admin/accounts?status=open&operatingDayId=${dayId}&visitId=${f.visit.id}&page=1&limit=1`,
        )
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      expect(accounts.body.total).toBe(1);
      expect(accounts.body.items[0].id).toBe(accountId);
      const settlements = await request(http())
        .get(
          `/api/v1/admin/settlements?status=pending&accountId=${accountId}&cashRegisterId=${result.body.cashRegisterId}&page=1&limit=1`,
        )
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      expect(settlements.body.total).toBe(1);
      expect(settlements.body.items[0].id).toBe(result.body.id);
      await request(http())
        .get('/api/v1/admin/settlements?status=invalid')
        .set('Authorization', auth(tokens.worker))
        .expect(400);
      await request(http())
        .post(`/api/v1/admin/settlements/${result.body.id}/cancel`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'historical-cancel')
        .send({ reason: 'Prueba' })
        .expect(200);
      const [previous] = await db.query(
        `INSERT INTO jornada_operativa(fecha_operativa,estado,abierta_por) SELECT fecha_operativa-7,'closed',$2 FROM jornada_operativa WHERE id_jornada=$1 RETURNING id_jornada`,
        [dayId, users.admin],
      );
      await db.query(
        'UPDATE cuenta_consumo SET id_jornada=$2 WHERE id_cuenta=$1',
        [accountId, previous.id_jornada],
      );
      await db.query(
        'UPDATE visita_mesa SET id_jornada=$2 WHERE id_visita=$1',
        [f.visit.id, previous.id_jornada],
      );
      await db.query('UPDATE pedido SET id_jornada=$2 WHERE id_pedido=$1', [
        order.body.id,
        previous.id_jornada,
      ]);
      const historical = await request(http())
        .post(`/api/v1/admin/accounts/${accountId}/settlements`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'historical-settlement')
        .send({})
        .expect(201);
      expect(historical.body.cashRegisterId).toBe(result.body.cashRegisterId);
      const paymentUrl = `/api/v1/admin/settlements/${historical.body.id}/cash-payments`;
      await request(http())
        .post(paymentUrl)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'insufficient')
        .send({ receivedCents: 499 })
        .expect(409);
      await request(http())
        .post(paymentUrl)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'denied-payment')
        .send({ receivedCents: 700 })
        .expect(403);
      await failAudit('payment.confirmed');
      try {
        await request(http())
          .post(paymentUrl)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'failed-payment')
          .send({ receivedCents: 700 })
          .expect(500);
      } finally {
        await restoreAudit();
      }
      const [{ paymentCount }] = await db.query(
        'SELECT count(*)::int AS "paymentCount" FROM pago WHERE id_liquidacion=$1',
        [historical.body.id],
      );
      expect(paymentCount).toBe(0);
      const collect = () =>
        request(http())
          .post(paymentUrl)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', 'cash-payment')
          .send({ receivedCents: 700 });
      const [payment, simultaneous] = await Promise.all([
        collect().expect(201),
        collect().expect(201),
      ]);
      expect(simultaneous.body).toEqual(payment.body);
      const earned = await request(http())
        .get(`/api/v1/me/points/movements?paymentId=${payment.body.payment.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(earned.body.total).toBe(1);
      expect(earned.body.items[0].points).toBe(10);
      expect(payment.body.payment.amountCents).toBe(500);
      expect(payment.body.payment.changeCents).toBe(200);
      expect((await collect().expect(201)).body).toEqual(payment.body);
      await request(http())
        .post(paymentUrl)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'second-payment')
        .send({ receivedCents: 700 })
        .expect(409);
      const paid = await request(http())
        .get(`/api/v1/me/accounts/${accountId}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(paid.body.paidCents).toBe(500);
      expect(paid.body.pendingCents).toBe(0);
      expect(paid.body.status).toBe('closed');
      await request(http())
        .get(`/api/v1/me/payments/${payment.body.payment.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/visits/${f.visit.id}/close`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'close-paid-visit')
        .expect(200);
    });

    it('allows a registered customer to submit a private transfer receipt', async () => {
      const f = await fixture();
      const p = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'registered-transfer-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Cliente' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${p.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'registered-transfer-approve')
        .expect(200);
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('Registrado transferencia','registrado transferencia') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'registered-transfer-product','Producto',200,false) RETURNING id_producto`,
        [category.id_categoria],
      );
      const order = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/orders`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'registered-transfer-order')
        .send({ items: [{ productId: product.id_producto, quantity: 1 }] })
        .expect(201);
      for (const action of ['start-preparation', 'ready', 'deliver'])
        await request(http())
          .post(`/api/v1/admin/orders/${order.body.id}/${action}`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', `registered-transfer-${action}`)
          .send({ expectedVersion: 1 })
          .expect(200);
      const settlement = await request(http())
        .post(`/api/v1/admin/accounts/${order.body.accountId}/settlements`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', 'registered-transfer-settlement')
        .send({})
        .expect(201);
      const payment = await request(http())
        .post(`/api/v1/me/settlements/${settlement.body.id}/transfer-payments`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', 'registered-transfer-upload')
        .attach('file', Buffer.from('%PDF-1.7\nregistered'), {
          filename: 'receipt.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      await request(http())
        .get(`/api/v1/me/payments/${payment.body.id}/receipt`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
    });
    it('creates a delivery atomically, collects transfer before preparation and keeps its account open', async () => {
      const settings = await request(http())
        .put('/api/v1/admin/delivery/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '8b-settings')
        .send({
          enabled: true,
          coverageDescription: 'Centro',
          shippingFeeCents: 200,
        })
        .expect(200);
      const makeRequest = async (key: string) => {
        const r = await request(http())
          .post('/api/v1/me/delivery-requests')
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', key)
          .send({
            configurationVersion: settings.body.version,
            recipientName: 'Cliente',
            phone: '099',
            address: 'Direccion privada',
          })
          .expect(201);
        await request(http())
          .post(`/api/v1/admin/delivery-requests/${r.body.id}/approve`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', key + '-approve')
          .send({})
          .expect(200);
        return r.body.id;
      };
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('8B','8b') RETURNING id_categoria`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'8b-product','Producto',500,true) RETURNING id_producto`,
        [category.id_categoria],
      );
      await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,cantidad_reservada,inicializado_por) VALUES ($1,$2,3,3,0,$3)`,
        [dayId, product.id_producto, users.admin],
      );
      const requestId = await makeRequest('8b-request');
      const url = `/api/v1/me/delivery-requests/${requestId}/orders`;
      const body = { items: [{ productId: product.id_producto, quantity: 1 }] };
      const guest = await guests.create({ name: 'Invitado 8B' });
      await request(http())
        .post(url)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', '8b-guest')
        .send(body)
        .expect(401);
      await request(http())
        .post(url)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-worker')
        .send(body)
        .expect(403);
      await failAudit('delivery.order_submitted');
      try {
        await request(http())
          .post(url)
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', '8b-rollback')
          .send(body)
          .expect(500);
      } finally {
        await restoreAudit();
      }
      const [rolled] = await db.query(
        'SELECT cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [product.id_producto],
      );
      expect(rolled.cantidad_reservada).toBe(0);
      const create = () =>
        request(http())
          .post(url)
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', '8b-order')
          .send(body);
      const [first, replay] = await Promise.all([create(), create()]);
      expect(first.status).toBe(201);
      expect(replay.body).toEqual(first.body);
      const order = first.body;
      expect(order.totalCents).toBe(700);
      expect(order.shippingCents).toBe(200);
      expect(order.modality).toBe('delivery');
      expect(order.canEdit).toBe(false);
      await request(http())
        .post(url)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-second')
        .send(body)
        .expect(409);
      await request(http())
        .post(`/api/v1/me/delivery-requests/${requestId}/cancel`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-used')
        .send({})
        .expect(409);
      const action = (name: string, key: string) =>
        request(http())
          .post(`/api/v1/admin/orders/${order.id}/${name}`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', key)
          .send({
            expectedVersion: 1,
            ...(name === 'cancel' ? { reason: 'Anular' } : {}),
          });
      await action('start-preparation', '8b-unpaid').expect(409);
      await request(http())
        .post(`/api/v1/admin/settlements/${order.settlement.id}/cash-payments`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-cash')
        .send({ receivedCents: 700 })
        .expect(409);
      await request(http())
        .post(`/api/v1/admin/settlements/${order.settlement.id}/cancel`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-bill-cancel')
        .send({ reason: 'Anular' })
        .expect(409);
      const listing = await request(http())
        .get('/api/v1/me/orders?modality=delivery')
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(
        listing.body.items.some((o: { id: string }) => o.id === order.id),
      ).toBe(true);
      expect(listing.body.items[0].delivery).toBeUndefined();
      const transfer = await request(http())
        .post(`/api/v1/me/settlements/${order.settlement.id}/transfer-payments`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-transfer')
        .attach('file', Buffer.from('%PDF-1.7 receipt'), {
          filename: 'receipt.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      await action('cancel', '8b-pending-cancel').expect(409);
      await request(http())
        .post(`/api/v1/admin/payments/${transfer.body.id}/confirm`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-confirm')
        .send({ bankOperationReference: '8B-001' })
        .expect(200);
      const account = await request(http())
        .get(`/api/v1/me/accounts/${order.accountId}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(account.body.status).toBe('open');
      expect(account.body.paidCents).toBe(700);
      expect(account.body.pendingCents).toBe(0);
      await action('cancel', '8b-paid-cancel').expect(409);
      await action('start-preparation', '8b-start').expect(200);
      await action('start-preparation', '8b-start').expect(200);
      await action('ready', '8b-ready').expect(200);
      await action('deliver', '8b-deliver').expect(409);
      const dispatch = () => action('dispatch', '8c-dispatch');
      await dispatch().expect(200);
      await dispatch().expect(200);
      const [snapshot] = await db.query(
        'SELECT puntos::int AS points,estado FROM acumulacion_puntos WHERE id_pago=$1',
        [transfer.body.id],
      );
      expect(snapshot.estado).toBe('pending');
      await request(http())
        .put('/api/v1/admin/points/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'points-rate-change')
        .send({ enabled: false, pointsPerDollar: 8 })
        .expect(200);
      await failAudit('points.earned');
      try {
        await action('deliver', '8c-deliver').expect(500);
      } finally {
        await restoreAudit();
      }
      await action('deliver', '8c-deliver').expect(200);
      const history = await request(http())
        .get(`/api/v1/me/points/movements?paymentId=${transfer.body.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(history.body.items[0].points).toBe(snapshot.points);
      await request(http())
        .put('/api/v1/admin/points/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', 'points-rate-restore')
        .send({ enabled: true, pointsPerDollar: 2 })
        .expect(200);

      const delivered = await request(http())
        .get(`/api/v1/me/accounts/${order.accountId}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(delivered.body.status).toBe('closed');
      const [stock] = await db.query(
        'SELECT cantidad_fisica,cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [product.id_producto],
      );
      expect(stock).toEqual({ cantidad_fisica: 2, cantidad_reservada: 0 });
      await request(http())
        .get(`/api/v1/me/orders/${order.id}`)
        .set('Authorization', auth(guest.token))
        .expect(404);
      await request(http())
        .get('/api/v1/me/accounts?modality=delivery')
        .set('Authorization', auth(tokens.client))
        .expect(200);
      await request(http())
        .put(`/api/v1/me/orders/${order.id}`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-edit')
        .send({ ...body, expectedVersion: 1 })
        .expect(409);
      const shortageId = await makeRequest('8b-shortage');
      const shortageUrl = `/api/v1/me/delivery-requests/${shortageId}/orders`;
      const send = (payload: unknown, key: string) =>
        request(http())
          .post(shortageUrl)
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', key)
          .send(payload);
      await send(
        { items: [{ productId: product.id_producto, quantity: 999 }] },
        '8b-short',
      ).expect(409);
      await send({ ...body, priceCents: 1 }, '8b-extra').expect(400);
      await send(
        { items: [body.items[0], body.items[0]] },
        '8b-duplicates',
      ).expect(400);
      await db.query(
        `UPDATE producto SET visible_menu=false WHERE id_producto=$1`,
        [product.id_producto],
      );
      await send(body, '8b-hidden').expect(409);
      await db.query(
        `UPDATE producto SET visible_menu=true WHERE id_producto=$1`,
        [product.id_producto],
      );
      await db.query(`UPDATE caja SET estado='closed' WHERE id_jornada=$1`, [
        dayId,
      ]);
      try {
        await send(body, '8b-closed-cash').expect(409);
      } finally {
        await db.query(`UPDATE caja SET estado='open' WHERE id_jornada=$1`, [
          dayId,
        ]);
      }
      const cancelId = await makeRequest('8b-cancel-request');
      const cancelled = await request(http())
        .post(`/api/v1/me/delivery-requests/${cancelId}/orders`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-cancel-order')
        .send(body)
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/orders/${cancelled.body.id}/cancel`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-cancel')
        .send({ expectedVersion: 1, reason: 'Sin pago' })
        .expect(200);
      const closed = await request(http())
        .get(`/api/v1/me/accounts/${cancelled.body.accountId}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(closed.body.status).toBe('closed');
      const retryId = await makeRequest('8b-reject-request');
      const retry = await request(http())
        .post(`/api/v1/me/delivery-requests/${retryId}/orders`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-reject-order')
        .send(body)
        .expect(201);
      const upload = () =>
        request(http())
          .post(
            `/api/v1/me/settlements/${retry.body.settlement.id}/transfer-payments`,
          )
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', '8b-reject-upload')
          .attach('file', Buffer.from('%PDF-1.7 receipt'), {
            filename: 'receipt.pdf',
            contentType: 'application/pdf',
          });
      const attempt = await upload().expect(201);
      await db.query(
        `UPDATE entrega_domicilio SET comprobante_hasta=clock_timestamp()-interval '1 second' WHERE id_pedido=$1`,
        [retry.body.id],
      );
      await app.get(DeliveryExpiryService).sweep();
      const [pendingReview] = await db.query(
        'SELECT estado FROM pedido WHERE id_pedido=$1',
        [retry.body.id],
      );
      expect(pendingReview.estado).toBe('submitted');
      await request(http())
        .post(`/api/v1/admin/payments/${attempt.body.id}/reject`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-reject')
        .send({ reason: 'No acreditado' })
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/orders/${retry.body.id}/cancel`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-rejected-cancel')
        .send({ expectedVersion: 1, reason: 'No pagado' })
        .expect(409);
      const rollbackProbe = db.createQueryRunner();
      await rollbackProbe.startTransaction();
      try {
        await expect(
          new DeliveryFulfillment1794400000000().down(rollbackProbe),
        ).rejects.toThrow('etapa 8C');
      } finally {
        await rollbackProbe.rollbackTransaction();
        await rollbackProbe.release();
      }
      const freeSettings = await request(http())
        .put('/api/v1/admin/delivery/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '8b-free-settings')
        .send({
          enabled: true,
          coverageDescription: 'Centro',
          shippingFeeCents: 0,
        })
        .expect(200);
      const freeRequest = await request(http())
        .post('/api/v1/me/delivery-requests')
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-free-request')
        .send({
          configurationVersion: freeSettings.body.version,
          recipientName: 'Cliente',
          phone: '099',
          address: 'Direccion',
        })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/delivery-requests/${freeRequest.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-free-approve')
        .send({})
        .expect(200);
      const [free] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'8b-free','Gratis',0,false) RETURNING id_producto`,
        [category.id_categoria],
      );
      const freeUrl = `/api/v1/me/delivery-requests/${freeRequest.body.id}/orders`;
      await request(http())
        .post(freeUrl)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-zero-total')
        .send({ items: [{ productId: free.id_producto, quantity: 1 }] })
        .expect(409);
      await db.query(
        `UPDATE producto SET precio_ctvs=100 WHERE id_producto=$1`,
        [free.id_producto],
      );
      const freeShipping = await request(http())
        .post(freeUrl)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8b-free-shipping')
        .send({ items: [{ productId: free.id_producto, quantity: 1 }] })
        .expect(201);
      expect(freeShipping.body.shippingCents).toBe(0);
      expect(freeShipping.body.delivery.receiptSubmissionDeadline).toBeTruthy();
      await db.query(
        `UPDATE entrega_domicilio SET comprobante_hasta=clock_timestamp()-interval '1 second' WHERE id_pedido=$1`,
        [freeShipping.body.id],
      );
      await request(http())
        .post(
          `/api/v1/me/settlements/${freeShipping.body.settlement.id}/transfer-payments`,
        )
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '8c-too-late')
        .attach('file', Buffer.from('%PDF-1.7 late'), {
          filename: 'r.pdf',
          contentType: 'application/pdf',
        })
        .expect(409);
      await failAudit('order.expired');
      try {
        await app.get(DeliveryExpiryService).sweep();
        const [saved] = await db.query(
          'SELECT estado FROM pedido WHERE id_pedido=$1',
          [freeShipping.body.id],
        );
        expect(saved.estado).toBe('submitted');
      } finally {
        await restoreAudit();
      }
      await Promise.all([
        app.get(DeliveryExpiryService).sweep(),
        app.get(DeliveryExpiryService).sweep(),
      ]);
      const [expired] = await db.query(
        'SELECT estado FROM pedido WHERE id_pedido=$1',
        [freeShipping.body.id],
      );
      expect(expired.estado).toBe('cancelled');

      const competing: string[] = [];
      for (let n = 0; n < 2; n++) {
        const r = await request(http())
          .post('/api/v1/me/delivery-requests')
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', `8b-stock-request-${n}`)
          .send({
            configurationVersion: freeSettings.body.version,
            recipientName: 'Cliente',
            phone: '099',
            address: 'Direccion',
          })
          .expect(201);
        await request(http())
          .post(`/api/v1/admin/delivery-requests/${r.body.id}/approve`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', `8b-stock-approve-${n}`)
          .send({})
          .expect(200);
        competing.push(r.body.id);
      }
      const race = await Promise.all(
        competing.map((id, n) =>
          request(http())
            .post(`/api/v1/me/delivery-requests/${id}/orders`)
            .set('Authorization', auth(tokens.client))
            .set('Idempotency-Key', `8b-stock-${n}`)
            .send({ items: [{ productId: product.id_producto, quantity: 2 }] }),
        ),
      );
      expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
      const winner = race.find((r) => r.status === 201)!;
      await request(http())
        .post(`/api/v1/admin/orders/${winner.body.id}/cancel`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '8b-stock-cancel')
        .send({ expectedVersion: 1, reason: 'Liberar' })
        .expect(200);
    });

    it('reviews cancellation with guest privacy, withdrawal, permissions, idempotency and consumed stock', async () => {
      const f = await fixture();
      const guest = await guests.create({ name: 'Cancelacion' });
      const participant = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', '9a-participant')
        .send({ qrToken: f.qr.qrToken, alias: 'Cancelacion' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${participant.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-participant-approve')
        .expect(200);
      const [cat] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('9A','9a') RETURNING id_categoria`,
      );
      const [prod] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'9a-product','Producto',500,false) RETURNING id_producto`,
        [cat.id_categoria],
      );
      const order = await request(http())
        .post(`/api/v1/visits/${f.visit.id}/orders`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', '9a-order')
        .send({ items: [{ productId: prod.id_producto, quantity: 1 }] })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/orders/${order.body.id}/start-preparation`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-prepare')
        .send({ expectedVersion: 1 })
        .expect(200);
      const create = () =>
        request(http())
          .post(`/api/v1/me/orders/${order.body.id}/cancellation-requests`)
          .set('Authorization', auth(guest.token))
          .set('Idempotency-Key', '9a-create')
          .send({ expectedVersion: 1, reason: 'Cancelar' });
      const r = await create().expect(201);
      expect((await create().expect(201)).body).toEqual(r.body);
      await request(http())
        .get(`/api/v1/me/cancellation-requests/${r.body.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(404);
      await request(http())
        .post(`/api/v1/admin/orders/${order.body.id}/ready`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-block')
        .send({ expectedVersion: 1 })
        .expect(409);
      await request(http())
        .post(`/api/v1/admin/cancellation-requests/${r.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-worker')
        .send({})
        .expect(403);
      await request(http())
        .post(`/api/v1/me/cancellation-requests/${r.body.id}/withdraw`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', '9a-withdraw')
        .send({})
        .expect(200);
      let second = await request(http())
        .post(`/api/v1/admin/orders/${order.body.id}/cancellation-requests`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-staff-create')
        .send({ expectedVersion: 1, reason: 'Cancelar' })
        .expect(201);
      await request(http())
        .post(`/api/v1/me/cancellation-requests/${second.body.id}/withdraw`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', '9a-staff-withdraw')
        .send({})
        .expect(404);
      await request(http())
        .post(`/api/v1/admin/cancellation-requests/${second.body.id}/reject`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9a-reject')
        .send({ reason: 'Continuar' })
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/orders/${order.body.id}/ready`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-resume')
        .send({ expectedVersion: 1 })
        .expect(200);
      second = await request(http())
        .post(`/api/v1/admin/orders/${order.body.id}/cancellation-requests`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-final-request')
        .send({ expectedVersion: 1, reason: 'Cancelar listo' })
        .expect(201);
      const approve = () =>
        request(http())
          .post(`/api/v1/admin/cancellation-requests/${second.body.id}/approve`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '9a-approve')
          .send({});
      await failAudit('cancellation.approve');
      try {
        await approve().expect(500);
      } finally {
        await restoreAudit();
      }
      await approve().expect(200);
      await approve().expect(200);
      const saved = await request(http())
        .get(`/api/v1/me/orders/${order.body.id}`)
        .set('Authorization', auth(guest.token))
        .expect(200);
      expect(saved.body.status).toBe('cancelled');
      await request(http())
        .get('/api/v1/admin/refunds')
        .set('Authorization', auth(tokens.worker))
        .expect(200);
    });

    it('authorizes one complete delivery refund without returning money or consumed stock', async () => {
      const settings = await request(http())
        .put('/api/v1/admin/delivery/settings')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9a-paid-settings')
        .send({
          enabled: true,
          coverageDescription: 'Centro',
          shippingFeeCents: 200,
        })
        .expect(200);
      const coverage = await request(http())
        .post('/api/v1/me/delivery-requests')
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '9a-paid-coverage')
        .send({
          configurationVersion: settings.body.version,
          recipientName: 'Cliente',
          phone: '099',
          address: 'Direccion',
        })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/delivery-requests/${coverage.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-paid-coverage-approve')
        .send({})
        .expect(200);
      const [cat] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES ('9A pagado','9a pagado') RETURNING id_categoria`,
      );
      const [prod] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES ($1,'9a-paid','Producto',500,true) RETURNING id_producto`,
        [cat.id_categoria],
      );
      await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,inicializado_por) VALUES ($1,$2,2,2,$3)`,
        [dayId, prod.id_producto, users.admin],
      );
      const order = await request(http())
        .post(`/api/v1/me/delivery-requests/${coverage.body.id}/orders`)
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '9a-paid-order')
        .send({ items: [{ productId: prod.id_producto, quantity: 1 }] })
        .expect(201);
      const url = `/api/v1/me/orders/${order.body.id}/cancellation-requests`;
      const ask = (key: string) =>
        request(http())
          .post(url)
          .set('Authorization', auth(tokens.client))
          .set('Idempotency-Key', key)
          .send({ expectedVersion: 1, reason: 'Cancelar todo' });
      await ask('9a-unpaid').expect(409);
      const payment = await request(http())
        .post(
          `/api/v1/me/settlements/${order.body.settlement.id}/transfer-payments`,
        )
        .set('Authorization', auth(tokens.client))
        .set('Idempotency-Key', '9a-paid-proof')
        .attach('file', Buffer.from('%PDF-1.7 receipt'), {
          filename: 'r.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      await ask('9a-pending-proof').expect(409);
      await request(http())
        .post(`/api/v1/admin/payments/${payment.body.id}/confirm`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-paid-confirm')
        .send({ bankOperationReference: '9A-PAID' })
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/orders/${order.body.id}/start-preparation`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9a-paid-prepare')
        .send({ expectedVersion: 1 })
        .expect(200);
      const asks = await Promise.all([
        ask('9a-paid-request'),
        ask('9a-paid-duplicate'),
      ]);
      expect(asks.map((r) => r.status).sort()).toEqual([201, 409]);
      const r = asks.find((x) => x.status === 201)!;
      const approve = (key: string) =>
        request(http())
          .post(`/api/v1/admin/cancellation-requests/${r.body.id}/approve`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', key)
          .send({});
      await failAudit('cancellation.approve');
      try {
        await approve('9a-paid-fail').expect(500);
      } finally {
        await restoreAudit();
      }
      const [rolled] = await db.query(
        `SELECT count(*)::int AS total FROM devolucion WHERE id_pedido=$1`,
        [order.body.id],
      );
      expect(rolled.total).toBe(0);
      const approvals = await Promise.all([
        approve('9a-paid-approve'),
        approve('9a-paid-approve-other'),
      ]);
      expect(approvals.map((x) => x.status).sort()).toEqual([200, 409]);
      const approved = approvals.find((x) => x.status === 200)!;
      expect(approved.body.refund.amountCents).toBe(700);
      const [cancelledPoints] = await db.query(
        'SELECT estado FROM acumulacion_puntos WHERE id_pago=$1',
        [payment.body.id],
      );
      expect(cancelledPoints.estado).toBe('cancelled');
      const refundId = approved.body.refund.id;
      const refund = await request(http())
        .get(`/api/v1/me/refunds/${refundId}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(refund.body.amountCents).toBe(700);
      expect(refund.body.status).toBe('pending');
      const outsider = await guests.create({ name: 'Otro' });
      await request(http())
        .get(`/api/v1/me/refunds/${refundId}`)
        .set('Authorization', auth(outsider.token))
        .expect(404);
      await request(http())
        .get(
          `/api/v1/admin/refunds?orderId=${order.body.id}&paymentId=${payment.body.id}&limit=1`,
        )
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      const executeUrl = `/api/v1/admin/refunds/${refundId}/execute`;
      await request(http())
        .post(executeUrl)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '9b-worker-denied')
        .send({ method: 'transfer', bankOperationReference: 'DEV-000123' })
        .expect(403);
      const execute = () =>
        request(http())
          .post(executeUrl)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '9b-transfer')
          .send({
            method: 'transfer',
            bankOperationReference: ' dev-000123 ',
            notes: 'Transferencia ejecutada',
          });
      await failAudit('refund.completed');
      try {
        await execute().expect(500);
      } finally {
        await restoreAudit();
      }
      expect(
        (
          await request(http())
            .get(`/api/v1/me/refunds/${refundId}`)
            .set('Authorization', auth(tokens.client))
            .expect(200)
        ).body.status,
      ).toBe('pending');
      const completed = await execute().expect(200);
      expect(completed.body.status).toBe('completed');
      expect(completed.body.method).toBe('transfer');
      expect(completed.body.bankOperationReference).toBe('DEV-000123');
      expect(
        completed.body.history.map((x: { event: string }) => x.event),
      ).toEqual(['refund.authorized', 'refund.completed']);
      const [refundIdempotency] = await db.query(
        `SELECT recurso_id FROM idempotencia WHERE clave='9b-transfer' AND actor_usuario_id=$1`,
        [users.admin],
      );
      expect(refundIdempotency.recurso_id).toBe(refundId);
      expect((await execute().expect(200)).body).toEqual(completed.body);
      await request(http())
        .post(executeUrl)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9b-transfer-another-key')
        .send({ method: 'transfer', bankOperationReference: 'DEV-000123' })
        .expect(409);
      const privateRefund = (
        await request(http())
          .get(`/api/v1/me/refunds/${refundId}`)
          .set('Authorization', auth(tokens.client))
          .expect(200)
      ).body;
      expect(privateRefund.status).toBe('completed');
      expect(privateRefund.method).toBe('transfer');
      expect(privateRefund).not.toHaveProperty('bankOperationReference');
      expect(privateRefund.refundedCents).toBe(700);
      const account = await request(http())
        .get(`/api/v1/me/accounts/${order.body.accountId}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(account.body.status).toBe('closed');
      expect(account.body.paidCents).toBe(700);
      expect(account.body.refundPendingCents).toBe(0);
      expect(account.body.refundedCents).toBe(700);
      expect(account.body.pendingCents).toBe(0);
      await request(http())
        .get(
          `/api/v1/admin/operations/cash/${(await db.query('SELECT id_caja FROM caja WHERE id_jornada=$1', [dayId]))[0].id_caja}/summary`,
        )
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      const [stock] = await db.query(
        'SELECT cantidad_fisica,cantidad_reservada FROM inventario_diario WHERE id_producto=$1',
        [prod.id_producto],
      );
      expect(stock).toEqual({ cantidad_fisica: 1, cantidad_reservada: 0 });
      const [saved] = await db.query(
        `SELECT p.estado AS payment,l.estado AS settlement FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE p.id_pago=$1`,
        [payment.body.id],
      );
      expect(saved).toEqual({ payment: 'confirmed', settlement: 'settled' });
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await expect(
          new ExecuteRefunds1794600000000().down(runner),
        ).rejects.toThrow('devoluciones ejecutadas o con historial');
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });

    it('returns cash once from the current register and serializes competing refunds', async () => {
      const [cash] = await db.query(
        `SELECT id_caja FROM caja WHERE id_jornada=$1`,
        [dayId],
      );
      const amount = 1250;
      await db.query(`UPDATE caja SET monto_inicial_ctvs=$2 WHERE id_caja=$1`, [
        cash.id_caja,
        amount,
      ]);
      const refunds = [
        await createCashRefundFixture(1, amount),
        await createCashRefundFixture(2, amount),
      ];
      const refundUrl = `/api/v1/admin/refunds/${refunds[0]}/execute`;
      await request(http())
        .post(refundUrl)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9b-internal-field')
        .send({
          method: 'cash',
          recipientName: 'Persona',
          methodFields: 'injected',
        })
        .expect(400);
      await request(http())
        .post(refundUrl)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9b-invalid-amount')
        .send({ method: 'cash', recipientName: 'Persona', amountCents: amount })
        .expect(400);
      await request(http())
        .post(refundUrl)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9b-incompatible-fields')
        .send({
          method: 'cash',
          recipientName: 'Persona',
          bankOperationReference: 'REF',
        })
        .expect(400);
      await request(http())
        .post(refundUrl)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9b-missing-reference')
        .send({ method: 'transfer' })
        .expect(400);
      await request(http())
        .post(`/api/v1/admin/refunds/${refunds[0]}/execute`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9b-duplicate-bank-ref')
        .send({ method: 'transfer', bankOperationReference: 'DEV-000123' })
        .expect(409);
      const execute = (id: string, key: string) =>
        request(http())
          .post(`/api/v1/admin/refunds/${id}/execute`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', key)
          .send({
            method: 'cash',
            recipientName: ' Persona beneficiaria ',
            notes: 'Entrega registrada',
          });
      const results = await Promise.all([
        execute(refunds[0], '9b-cash-race-1'),
        execute(refunds[1], '9b-cash-race-2'),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      const success = results.find((result) => result.status === 200)!;
      expect(success.body.status).toBe('completed');
      expect(success.body.method).toBe('cash');
      expect(success.body.recipientName).toBe('Persona beneficiaria');
      expect(success.body.cashRegisterId).toBe(cash.id_caja);
      const [balance] = await db.query(
        `SELECT c.monto_inicial_ctvs::int AS opening,COALESCE(sum(s.importe_ctvs),0)::float8 AS refunds FROM caja c LEFT JOIN salida_caja_devolucion s ON s.id_caja=c.id_caja WHERE c.id_caja=$1 GROUP BY c.id_caja`,
        [cash.id_caja],
      );
      expect(balance.opening - balance.refunds).toBe(0);
      const summary = await request(http())
        .get(`/api/v1/admin/operations/cash/${cash.id_caja}/summary`)
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      expect(summary.body.cashRefundsCents).toBe(amount);
      expect(summary.body.balanceCents).toBe(
        summary.body.openingCents + summary.body.cashIncomeCents - amount,
      );
      const own = await request(http())
        .get(`/api/v1/me/refunds/${success.body.id}`)
        .set('Authorization', auth(tokens.client))
        .expect(200);
      expect(own.body.method).toBe('cash');
      expect(own.body).not.toHaveProperty('recipientName');
      expect(own.body).not.toHaveProperty('cashRegisterId');
      await request(http())
        .post(`/api/v1/admin/refunds/${success.body.id}/execute`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '9b-cash-replay-other-key')
        .send({ method: 'cash', recipientName: 'Persona' })
        .expect(409);
      await request(http())
        .get(`/api/v1/admin/refunds/${success.body.id}`)
        .set('Authorization', auth(tokens.worker))
        .expect(200)
        .then((response) =>
          expect(
            response.body.history.map(
              (entry: { event: string }) => entry.event,
            ),
          ).toEqual(['refund.authorized', 'refund.completed']),
        );
      const pendingId = refunds.find((id) => id !== success.body.id)!;
      await db.query(`UPDATE caja SET estado='closed' WHERE id_caja=$1`, [
        cash.id_caja,
      ]);
      try {
        await execute(pendingId, '9b-closed-cash').expect(409);
        const transfer = await request(http())
          .post(`/api/v1/admin/refunds/${pendingId}/execute`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '9b-transfer-closed-day')
          .send({ method: 'transfer', bankOperationReference: '9B-CLOSED-DAY' })
          .expect(200);
        expect(transfer.body.method).toBe('transfer');
        const after = await request(http())
          .get(`/api/v1/admin/operations/cash/${cash.id_caja}/summary`)
          .set('Authorization', auth(tokens.worker))
          .expect(200);
        expect(after.body.balanceCents).toBe(summary.body.balanceCents);
        expect(after.body.cashRefundsCents).toBe(amount);
      } finally {
        await db.query(`UPDATE caja SET estado='open' WHERE id_caja=$1`, [
          cash.id_caja,
        ]);
      }
    });

    it('reserves points and inventory for a registered-client reward, then transfers and resolves the reservation', async () => {
      const f = await fixture();
      const [rewardUser] = await db.query(
        `INSERT INTO usuario(id_rol,correo_normalizado,password_hash) SELECT id_rol,$1,'unused' FROM rol WHERE codigo='client' RETURNING id_usuario id`,
        [`10b-${randomUUID()}@test.invalid`],
      );
      await db.query(
        "INSERT INTO perfil(id_usuario,nombres) VALUES($1,'Canje')",
        [rewardUser.id],
      );
      const [rewardClient] = await db.query(
        'INSERT INTO cliente(id_usuario) VALUES($1) RETURNING id_cliente id',
        [rewardUser.id],
      );
      const [rewardSession] = await db.query(
        `INSERT INTO sesion_usuario(id_usuario,refresh_hash,expira_en) VALUES($1,$2,now()+interval '1 day') RETURNING id_sesion_usuario id`,
        [rewardUser.id, hashAccessSecret(randomUUID())],
      );
      const rewardToken = await app
        .get(JwtService)
        .signAsync({ sub: rewardUser.id, sid: rewardSession.id, av: 0 });
      await request(http())
        .post(`/api/v1/visits/${f.visit.id}/participants`)
        .set('Authorization', auth(rewardToken))
        .set('Idempotency-Key', '10b-client-join')
        .send({ qrToken: f.qr.qrToken, alias: 'Canje' })
        .expect(201);
      const [participant] = await db.query(
        `SELECT id_participante id FROM participante WHERE id_visita=$1 AND id_cliente=$2`,
        [f.visit.id, rewardClient.id],
      );
      await request(http())
        .post(`/api/v1/admin/participants/${participant.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '10b-client-approve')
        .send({})
        .expect(200);
      const [account] = await db.query(
        'SELECT id_cuenta id FROM cuenta_consumo WHERE id_participante=$1',
        [participant.id],
      );
      const [cash] = await db.query(
        `INSERT INTO caja(id_jornada,monto_inicial_ctvs,abierta_por) VALUES($1,0,$2) ON CONFLICT(id_jornada) DO UPDATE SET estado='open' RETURNING id_caja id`,
        [dayId, users.admin],
      );
      const [bill] = await db.query(
        `INSERT INTO liquidacion(id_cuenta,id_caja,estado,productos_ctvs,envio_ctvs,total_ctvs,creada_por,cerrada_en,cerrada_por,resolucion) VALUES($1,$2,'settled',1000,0,1000,$3,now(),$3,'cash') RETURNING id_liquidacion id`,
        [account.id, cash.id, users.admin],
      );
      const [payment] = await db.query(
        `INSERT INTO pago(id_liquidacion,metodo,estado,importe_ctvs,recibido_ctvs,cambio_ctvs,registrado_usuario) VALUES($1,'cash','confirmed',1000,1000,0,$2) RETURNING id_pago id`,
        [bill.id, users.admin],
      );
      const [config] = await db.query(
        'SELECT id_configuracion id FROM configuracion_puntos ORDER BY version DESC LIMIT 1',
      );
      const [accrual] = await db.query(
        `INSERT INTO acumulacion_puntos(id_pago,id_cliente,id_configuracion,productos_ctvs,puntos,estado,acreditada_en) VALUES($1,$2,$3,1000,200,'credited',now()) RETURNING id_acumulacion id`,
        [payment.id, rewardClient.id, config.id],
      );
      await db.query(
        `INSERT INTO movimiento_puntos(id_cliente,id_acumulacion,tipo,puntos) VALUES($1,$2,'earn',200)`,
        [rewardClient.id, accrual.id],
      );
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES('10B reward','10b reward') RETURNING id_categoria id`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES($1,'10b-reward','Producto premio',500,true) RETURNING id_producto id`,
        [category.id],
      );
      await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,inicializado_por) VALUES($1,$2,2,2,$3)`,
        [dayId, product.id, users.admin],
      );
      await failAudit('reward.created');
      try {
        await request(http())
          .post('/api/v1/admin/rewards')
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '10b-create-reward')
          .send({
            name: 'Producto gratis',
            productId: product.id,
            pointsCost: 50,
            active: true,
            sortOrder: 1,
          })
          .expect(500);
      } finally {
        await restoreAudit();
      }
      const createdReward = await request(http())
        .post('/api/v1/admin/rewards')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '10b-create-reward')
        .send({
          name: 'Producto gratis',
          productId: product.id,
          pointsCost: 50,
          active: true,
          sortOrder: 1,
        })
        .expect(201);
      const rewardId = createdReward.body.id;
      const changed = await request(http())
        .patch(`/api/v1/admin/rewards/${rewardId}`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '10b-update-reward')
        .send({ expectedVersion: 1, name: 'Producto gratis actualizado' })
        .expect(200);
      expect(changed.body.version).toBe(2);
      const [updateRecord] = await db.query(
        "SELECT recurso_id FROM idempotencia WHERE clave='10b-update-reward'",
      );
      expect(updateRecord.recurso_id).toBe(rewardId);
      await request(http())
        .patch(`/api/v1/admin/rewards/${rewardId}`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '10b-stale-update')
        .send({ expectedVersion: 1, name: 'Cambio desactualizado' })
        .expect(409);

      await request(http()).get('/api/v1/rewards').expect(200);
      const guest = await guests.create({ name: 'Sin puntos' });
      await request(http())
        .get('/api/v1/me/redemptions')
        .set('Authorization', auth(guest.token))
        .expect(401);
      await request(http())
        .get(`/api/v1/me/redemptions/${randomUUID()}`)
        .set('Authorization', auth(guest.token))
        .expect(401);
      await request(http())
        .post(`/api/v1/visits/${f.visit.id}/redemptions`)
        .set('Authorization', auth(guest.token))
        .set('Idempotency-Key', '10b-guest-denied')
        .send({ rewardId, rewardVersion: 2 })
        .expect(401);
      const create = () =>
        request(http())
          .post(`/api/v1/visits/${f.visit.id}/redemptions`)
          .set('Authorization', auth(rewardToken))
          .set('Idempotency-Key', '10b-create-redemption')
          .send({ rewardId, rewardVersion: 2 });
      await failAudit('redemption.requested');
      try {
        await create().expect(500);
      } finally {
        await restoreAudit();
      }
      const redemption = await create().expect(201);
      expect((await create().expect(201)).body).toEqual(redemption.body);
      expect(
        (
          await request(http())
            .get('/api/v1/me/points')
            .set('Authorization', auth(rewardToken))
        ).body,
      ).toMatchObject({
        balance: 200,
        reservedPoints: 50,
        availablePoints: 150,
      });
      const [reserved] = await db.query(
        'SELECT cantidad_fisica physical,cantidad_reservada reserved FROM inventario_diario WHERE id_producto=$1',
        [product.id],
      );
      expect(reserved).toEqual({ physical: 2, reserved: 1 });
      const approve = (key: string) =>
        request(http())
          .post(`/api/v1/admin/redemptions/${redemption.body.id}/approve`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', key)
          .send({});
      const approvalRace = await Promise.all([
        approve('10b-approve-redemption-1'),
        approve('10b-approve-redemption-2'),
      ]);
      expect(approvalRace.map((x) => x.status).sort()).toEqual([200, 409]);
      const approvedResponse = approvalRace.find((x) => x.status === 200)!;
      const approved = approvedResponse.body;
      const approvalReplay = await approve('10b-approve-redemption-1');
      if (approvalReplay.status === 200)
        expect(approvalReplay.body).toEqual(approved);
      else
        expect((await approve('10b-approve-redemption-2')).body).toEqual(
          approved,
        );
      expect(
        (
          await request(http())
            .get('/api/v1/me/points')
            .set('Authorization', auth(rewardToken))
        ).body,
      ).toMatchObject({
        balance: 150,
        reservedPoints: 0,
        availablePoints: 150,
      });
      const rewardOrderId = approved.orderId;
      expect(rewardOrderId).toBeTruthy();
      const [transferred] = await db.query(
        `SELECT i.cantidad_fisica physical,i.cantidad_reservada reserved,r.estado FROM inventario_diario i JOIN reserva_inventario_canje r ON r.id_inventario=i.id_inventario WHERE i.id_producto=$1`,
        [product.id],
      );
      expect(transferred).toEqual({
        physical: 2,
        reserved: 1,
        estado: 'transferred',
      });
      await request(http())
        .post(`/api/v1/admin/orders/${rewardOrderId}/start-preparation`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '10b-prepare-order')
        .send({ expectedVersion: 1 })
        .expect(200);
      const [consumed] = await db.query(
        'SELECT cantidad_fisica physical,cantidad_reservada reserved FROM inventario_diario WHERE id_producto=$1',
        [product.id],
      );
      expect(consumed).toEqual({ physical: 1, reserved: 0 });
      await request(http())
        .post(`/api/v1/admin/orders/${rewardOrderId}/ready`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '10b-ready-order')
        .send({ expectedVersion: 1 })
        .expect(200);
      await request(http())
        .post(`/api/v1/admin/orders/${rewardOrderId}/deliver`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '10b-deliver-order')
        .send({ expectedVersion: 1 })
        .expect(200);
      await request(http())
        .get(`/api/v1/me/redemptions/${redemption.body.id}`)
        .set('Authorization', auth(rewardToken))
        .expect(200);
      await request(http())
        .get('/api/v1/me/points/movements?type=redeem')
        .set('Authorization', auth(rewardToken))
        .expect(200);
      const noStockProduct = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES($1,'10b-reward-no-stock','Producto sin stock',0,false) RETURNING id_producto id`,
        [category.id],
      );
      const secondReward = (
        await request(http())
          .post('/api/v1/admin/rewards')
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '10b-create-reward-no-stock')
          .send({
            name: 'Premio sin stock',
            productId: noStockProduct[0].id,
            pointsCost: 50,
            active: true,
            sortOrder: 2,
          })
          .expect(201)
      ).body;
      const second = (
        await request(http())
          .post(`/api/v1/visits/${f.visit.id}/redemptions`)
          .set('Authorization', auth(rewardToken))
          .set('Idempotency-Key', '10b-second-redemption')
          .send({ rewardId: secondReward.id, rewardVersion: 1 })
          .expect(201)
      ).body;
      const secondApproved = (
        await request(http())
          .post(`/api/v1/admin/redemptions/${second.id}/approve`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', '10b-second-approve')
          .send({})
          .expect(200)
      ).body;
      await request(http())
        .post(`/api/v1/me/orders/${secondApproved.orderId}/cancel`)
        .set('Authorization', auth(rewardToken))
        .set('Idempotency-Key', '10b-reward-order-cancel')
        .send({ expectedVersion: 1, reason: 'Prueba de reintegro' })
        .expect(200);
      expect(
        (
          await request(http())
            .get('/api/v1/me/points')
            .set('Authorization', auth(rewardToken))
        ).body,
      ).toMatchObject({
        balance: 150,
        reservedPoints: 0,
        availablePoints: 150,
      });
      const pending = (
        await request(http())
          .post(`/api/v1/visits/${f.visit.id}/redemptions`)
          .set('Authorization', auth(rewardToken))
          .set('Idempotency-Key', '10b-third-redemption')
          .send({ rewardId: secondReward.id, rewardVersion: 1 })
          .expect(201)
      ).body;
      expect(
        (
          await request(http())
            .get('/api/v1/me/points')
            .set('Authorization', auth(rewardToken))
        ).body.reservedPoints,
      ).toBe(50);
      await request(http())
        .post(`/api/v1/me/redemptions/${pending.id}/cancel`)
        .set('Authorization', auth(rewardToken))
        .set('Idempotency-Key', '10b-cancel-pending')
        .send({})
        .expect(200);
      const rejected = (
        await request(http())
          .post(`/api/v1/visits/${f.visit.id}/redemptions`)
          .set('Authorization', auth(rewardToken))
          .set('Idempotency-Key', '10b-rejected-redemption')
          .send({ rewardId: secondReward.id, rewardVersion: 1 })
          .expect(201)
      ).body;
      await request(http())
        .post(`/api/v1/admin/redemptions/${rejected.id}/reject`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '10b-reject-redemption')
        .send({ reason: 'No procede' })
        .expect(200);
      const expiring = (
        await request(http())
          .post(`/api/v1/visits/${f.visit.id}/redemptions`)
          .set('Authorization', auth(rewardToken))
          .set('Idempotency-Key', '10b-expiring-redemption')
          .send({ rewardId: secondReward.id, rewardVersion: 1 })
          .expect(201)
      ).body;
      await db.query(
        `UPDATE solicitud_canje SET expira_en=clock_timestamp()-interval '1 second' WHERE id_canje=$1`,
        [expiring.id],
      );
      await app.get(RewardsService).expirePending();
      expect(
        (
          await request(http())
            .get(`/api/v1/me/redemptions/${expiring.id}`)
            .set('Authorization', auth(rewardToken))
        ).body.status,
      ).toBe('expired');
      const pendingAtPayment = (
        await request(http())
          .post(`/api/v1/visits/${f.visit.id}/redemptions`)
          .set('Authorization', auth(rewardToken))
          .set('Idempotency-Key', '10b-pending-at-payment')
          .send({ rewardId: secondReward.id, rewardVersion: 1 })
          .expect(201)
      ).body;
      const zeroBill = (
        await request(http())
          .post(`/api/v1/admin/accounts/${account.id}/settlements`)
          .set('Authorization', auth(tokens.worker))
          .set('Idempotency-Key', '10b-zero-settlement')
          .send({})
          .expect(201)
      ).body;
      expect(zeroBill.totalCents).toBe(0);
      await request(http())
        .post(
          `/api/v1/admin/settlements/${zeroBill.id}/complete-without-payment`,
        )
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '10b-zero-close')
        .send({})
        .expect(200);

      expect(
        (
          await request(http())
            .get(`/api/v1/me/redemptions/${pendingAtPayment.id}`)
            .set('Authorization', auth(rewardToken))
            .expect(200)
        ).body.status,
      ).toBe('cancelled');
      const exitVisit = await fixture();
      const joined = await request(http())
        .post(`/api/v1/visits/${exitVisit.visit.id}/participants`)
        .set('Authorization', auth(rewardToken))
        .set('Idempotency-Key', '10b-exit-join')
        .send({ qrToken: exitVisit.qr.qrToken, alias: 'Salida' })
        .expect(201);
      await request(http())
        .post(`/api/v1/admin/participants/${joined.body.id}/approve`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '10b-exit-approve')
        .send({})
        .expect(200);
      const exitRequest = await request(http())
        .post(`/api/v1/visits/${exitVisit.visit.id}/redemptions`)
        .set('Authorization', auth(rewardToken))
        .set('Idempotency-Key', '10b-exit-request')
        .send({ rewardId: secondReward.id, rewardVersion: 1 })
        .expect(201);
      await request(http())
        .post(`/api/v1/me/participants/${joined.body.id}/leave`)
        .set('Authorization', auth(rewardToken))
        .set('Idempotency-Key', '10b-exit-leave')
        .send({})
        .expect(200);
      expect(
        (
          await request(http())
            .get(`/api/v1/me/redemptions/${exitRequest.body.id}`)
            .set('Authorization', auth(rewardToken))
            .expect(200)
        ).body.status,
      ).toBe('cancelled');
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await expect(
          new LocalRewards1794800000000().down(runner),
        ).rejects.toThrow('existen recompensas');
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });

    it('previews and closes an old cash register once, requiring a reason for discrepancies', async () => {
      const oldDay = '2020-01-01';
      const [day] = await db.query(
        `INSERT INTO jornada_operativa(fecha_operativa,abierta_por) VALUES($1,$2) RETURNING id_jornada id`,
        [oldDay, users.admin],
      );
      const [cash] = await db.query(
        `INSERT INTO caja(id_jornada,monto_inicial_ctvs,abierta_por) VALUES($1,1000,$2) RETURNING id_caja id`,
        [day.id, users.admin],
      );
      const [table] = await db.query(
        'INSERT INTO mesa(codigo) VALUES($1) RETURNING id_mesa id',
        [`11A-${randomUUID()}`],
      );
      const [visit] = await db.query(
        'INSERT INTO visita_mesa(id_mesa,id_jornada,abierta_por) VALUES($1,$2,$3) RETURNING id_visita id',
        [table.id, day.id, users.admin],
      );
      const [closureClientUser] = await db.query(
        `INSERT INTO usuario(id_rol,correo_normalizado,password_hash) SELECT id_rol,$1,'unused' FROM rol WHERE codigo='client' RETURNING id_usuario id`,
        [`11a-${randomUUID()}@test.invalid`],
      );
      await db.query(
        `INSERT INTO perfil(id_usuario,nombres) VALUES($1,'Cliente cierre')`,
        [closureClientUser.id],
      );
      const [client] = await db.query(
        'INSERT INTO cliente(id_usuario) VALUES($1) RETURNING id_cliente id',
        [closureClientUser.id],
      );
      const [participant] = await db.query(
        `INSERT INTO participante(id_visita,id_cliente,alias,estado,qr_version_aprobada,aprobada_por,aprobada_en) VALUES($1,$2,'Cierre','approved',1,$3,now()) RETURNING id_participante id`,
        [visit.id, client.id, users.admin],
      );
      const [account] = await db.query(
        `INSERT INTO cuenta_consumo(id_cliente,id_participante,id_jornada) VALUES($1,$2,$3) RETURNING id_cuenta id`,
        [client.id, participant.id, day.id],
      );
      const [bill] = await db.query(
        `INSERT INTO liquidacion(id_cuenta,id_caja,productos_ctvs,total_ctvs,creada_por) VALUES($1,$2,0,0,$3) RETURNING id_liquidacion id`,
        [account.id, cash.id, users.admin],
      );
      const [category] = await db.query(
        `INSERT INTO categoria(nombre,nombre_normalizado) VALUES($1,$2) RETURNING id_categoria id`,
        [`11A ${randomUUID()}`, `11a-${randomUUID()}`],
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES($1,$2,'Premio',0,false) RETURNING id_producto id`,
        [category.id, `11a-${randomUUID()}`],
      );
      const [reward] = await db.query(
        `INSERT INTO recompensa(nombre,id_producto,costo_puntos) VALUES('Canje pendiente',$1,10) RETURNING id_recompensa id`,
        [product.id],
      );
      const [redemption] = await db.query(
        `INSERT INTO solicitud_canje(id_cliente,id_participante,id_cuenta,id_visita,id_jornada,id_recompensa,version_recompensa,id_producto,controla_stock,costo_puntos,expira_en,creado_por) VALUES($1,$2,$3,$4,$5,$6,1,$7,false,10,now()+interval '15 minutes',$8) RETURNING id_canje id`,
        [
          client.id,
          participant.id,
          account.id,
          visit.id,
          day.id,
          reward.id,
          product.id,
          users.client,
        ],
      );
      await db.query(
        `INSERT INTO reserva_puntos_canje(id_canje,id_cliente,puntos) VALUES($1,$2,10)`,
        [redemption.id, client.id],
      );
      const preview = () =>
        request(http())
          .get(`/api/v1/admin/operations/cash/${cash.id}/closing-preview`)
          .set('Authorization', auth(tokens.worker));
      await preview()
        .expect(200)
        .then((r) =>
          expect(r.body).toMatchObject({
            canClose: false,
            expectedCents: 1000,
            blockers: { pendingSettlements: { total: 1 } },
          }),
        );
      await request(http())
        .post(`/api/v1/admin/operations/cash/${cash.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11a-blocked')
        .send({ countedCents: 1000 })
        .expect(409);
      await db.query(
        'UPDATE liquidacion SET productos_ctvs=100,total_ctvs=100 WHERE id_liquidacion=$1',
        [bill.id],
      );
      const [pendingTransfer] = await db.query(
        `INSERT INTO pago(id_liquidacion,metodo,estado,importe_ctvs,registrado_usuario,pagador_cliente) VALUES($1,'transfer','pendingVerification',100,$2,$3) RETURNING id_pago id`,
        [bill.id, users.admin, client.id],
      );
      await preview()
        .expect(200)
        .then((r) =>
          expect(r.body.blockers.pendingTransfers).toMatchObject({
            total: 1,
            items: [{ id: pendingTransfer.id, reason: expect.any(String) }],
          }),
        );
      await db.query(
        `UPDATE pago SET estado='rejected',verificado_por=$2,verificado_en=now(),motivo_rechazo='Prueba' WHERE id_pago=$1`,
        [pendingTransfer.id, users.admin],
      );
      await db.query(
        `UPDATE liquidacion SET estado='cancelled',anulada_por=$2,anulada_en=now(),motivo_anulacion='Prueba' WHERE id_liquidacion=$1`,
        [bill.id, users.admin],
      );
      const [blockedOrder] = await db.query(
        `INSERT INTO pedido(id_jornada,id_visita,id_cuenta,actor_usuario) VALUES($1,$2,$3,$4) RETURNING id_pedido id`,
        [day.id, visit.id, account.id, users.admin],
      );
      const [blockedVersion] = await db.query(
        `INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs) VALUES($1,1,'current',0) RETURNING id_version id`,
        [blockedOrder.id],
      );
      const [blockedDetail] = await db.query(
        `INSERT INTO detalle_pedido(id_version,id_producto,cantidad,precio_unitario_ctvs,controla_stock_snapshot) VALUES($1,$2,1,0,true) RETURNING id_detalle id`,
        [blockedVersion.id, product.id],
      );
      await db.query(
        `INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES($1,$2,1)`,
        [blockedDetail.id, account.id],
      );
      const [blockedInventory] = await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,cantidad_reservada,inicializado_por) VALUES($1,$2,1,1,1,$3) RETURNING id_inventario id`,
        [day.id, product.id, users.admin],
      );
      await db.query(
        `INSERT INTO reserva_inventario(id_detalle,id_inventario,cantidad) VALUES($1,$2,1)`,
        [blockedDetail.id, blockedInventory.id],
      );
      await preview()
        .expect(200)
        .then((r) =>
          expect(r.body).toMatchObject({
            canClose: false,
            blockers: {
              unsettledLocalConsumption: { total: 1 },
              activeOrderReservations: { total: 1 },
            },
          }),
        );
      await request(http())
        .post(`/api/v1/admin/operations/cash/${cash.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11a-consumption-blocked')
        .send({ countedCents: 1000 })
        .expect(409);
      await db.query(
        `UPDATE asignacion_consumo SET estado='superseded' WHERE id_detalle=$1`,
        [blockedDetail.id],
      );
      await db.query(
        `UPDATE reserva_inventario SET estado='released',resuelta_en=now() WHERE id_detalle=$1`,
        [blockedDetail.id],
      );
      await db.query(
        `UPDATE inventario_diario SET cantidad_reservada=0 WHERE id_inventario=$1`,
        [blockedInventory.id],
      );
      await db.query(
        `UPDATE pedido SET estado='cancelled' WHERE id_pedido=$1`,
        [blockedOrder.id],
      );
      await preview()
        .expect(200)
        .then((r) =>
          expect(r.body).toMatchObject({
            canClose: true,
            expectedCents: 1000,
            cashIncomeCents: 0,
            cashRefundsCents: 0,
          }),
        );
      await request(http())
        .post(`/api/v1/admin/operations/cash/${cash.id}/close`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '11a-worker-denied')
        .send({ countedCents: 900, reason: 'Faltante' })
        .expect(403);
      await request(http())
        .post(`/api/v1/admin/operations/cash/${cash.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11a-no-reason')
        .send({ countedCents: 900 })
        .expect(400);
      const close = () =>
        request(http())
          .post(`/api/v1/admin/operations/cash/${cash.id}/close`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '11a-cash-close')
          .send({ countedCents: 900, reason: 'Diferencia comprobada' });
      await failAudit('operations.cash_closed');
      try {
        await close().expect(500);
      } finally {
        await restoreAudit();
      }
      const [rolled] = await db.query(
        'SELECT estado FROM caja WHERE id_caja=$1',
        [cash.id],
      );
      expect(rolled.estado).toBe('open');
      const [redemptionRolled] = await db.query(
        'SELECT estado FROM solicitud_canje WHERE id_canje=$1',
        [redemption.id],
      );
      expect(redemptionRolled.estado).toBe('pending');
      const closeRace = await Promise.all([close(), close()]);
      expect(closeRace.map((r) => r.status)).toEqual([200, 200]);
      const closure = closeRace[0];
      expect(closure.body).toMatchObject({
        cashRegisterId: cash.id,
        openingCents: 1000,
        cashIncomeCents: 0,
        cashRefundsCents: 0,
        expectedCents: 1000,
        countedCents: 900,
        differenceCents: -100,
        reason: 'Diferencia comprobada',
      });
      expect(closeRace[1].body).toEqual(closure.body);
      const [releasedRedemption] = await db.query(
        `SELECT s.estado,r.estado reserva FROM solicitud_canje s JOIN reserva_puntos_canje r ON r.id_canje=s.id_canje WHERE s.id_canje=$1`,
        [redemption.id],
      );
      expect(releasedRedemption).toEqual({
        estado: 'cancelled',
        reserva: 'released',
      });
      const [redemptionHistory] = await db.query(
        `SELECT evento FROM historial_canje WHERE id_canje=$1`,
        [redemption.id],
      );
      expect(redemptionHistory.evento).toBe('redemption.cash_closed');
      await request(http())
        .post(`/api/v1/admin/operations/cash/${cash.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11a-second-close')
        .send({ countedCents: 900, reason: 'Otro intento' })
        .expect(409);
      await request(http())
        .get(`/api/v1/admin/operations/cash/${cash.id}/closure`)
        .set('Authorization', auth(tokens.worker))
        .expect(200)
        .then((r) => expect(r.body.id).toBe(closure.body.id));
      await request(http())
        .get(
          '/api/v1/admin/operations/cash?status=closed&operatingDayId=' +
            day.id,
        )
        .set('Authorization', auth(tokens.worker))
        .expect(200)
        .then((r) => expect(r.body.items[0].id).toBe(cash.id));
      await expect(
        db.query('UPDATE cierre_caja SET contado_ctvs=1000 WHERE id_caja=$1', [
          cash.id,
        ]),
      ).rejects.toThrow('inmutable');
      await expect(
        db.query("UPDATE caja SET estado='open' WHERE id_caja=$1", [cash.id]),
      ).rejects.toThrow('no puede modificarse');
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await expect(
          new CashRegisterClosures1794900000000().down(runner),
        ).rejects.toThrow('existen cierres de caja');
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
      const [exactDay] = await db.query(
        `INSERT INTO jornada_operativa(fecha_operativa,abierta_por) VALUES('2020-01-02',$1) RETURNING id_jornada id`,
        [users.admin],
      );
      const [exactCash] = await db.query(
        `INSERT INTO caja(id_jornada,monto_inicial_ctvs,abierta_por) VALUES($1,0,$2) RETURNING id_caja id`,
        [exactDay.id, users.admin],
      );
      for (const countedCents of [
        null,
        false,
        '',
        '0',
        -1,
        0.5,
        Number.MAX_SAFE_INTEGER + 1,
      ]) {
        await request(http())
          .post(`/api/v1/admin/operations/cash/${exactCash.id}/close`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '11a-invalid-count')
          .send({ countedCents })
          .expect(400);
      }
      await request(http())
        .post(`/api/v1/admin/operations/cash/${exactCash.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11a-exact-close')
        .send({ countedCents: 0 })
        .expect(200)
        .then((r) =>
          expect(r.body).toMatchObject({
            expectedCents: 0,
            countedCents: 0,
            differenceCents: 0,
            reason: null,
          }),
        );
    });

    it('closes an old cashless day, finalizes its visit, releases access and cancels unused delivery coverage', async () => {
      const [day] = await db.query(
        `INSERT INTO jornada_operativa(fecha_operativa,abierta_por) VALUES('2020-02-03',$1) RETURNING id_jornada id`,
        [users.admin],
      );
      const [table] = await db.query(
        `INSERT INTO mesa(codigo,qr_hash,qr_version) VALUES($1,$2,1) RETURNING id_mesa id`,
        [`11B-${randomUUID()}`, hashAccessSecret(randomUUID())],
      );
      const [visit] = await db.query(
        `INSERT INTO visita_mesa(id_mesa,id_jornada,abierta_por) VALUES($1,$2,$3) RETURNING id_visita id`,
        [table.id, day.id, users.admin],
      );
      const createClient = async (suffix: string) => {
        const [user] = await db.query(
          `INSERT INTO usuario(id_rol,correo_normalizado,password_hash) SELECT id_rol,$1,'unused' FROM rol WHERE codigo='client' RETURNING id_usuario id`,
          [`11b-${suffix}-${randomUUID()}@test.invalid`],
        );
        await db.query(`INSERT INTO perfil(id_usuario,nombres) VALUES($1,$2)`, [
          user.id,
          suffix,
        ]);
        const [client] = await db.query(
          `INSERT INTO cliente(id_usuario) VALUES($1) RETURNING id_cliente id`,
          [user.id],
        );
        return client.id as string;
      };
      const approvedClient = await createClient('approved');
      const pendingClient = await createClient('pending');
      await db.query(
        `INSERT INTO participante(id_visita,id_cliente,alias,estado,qr_version_aprobada,aprobada_por,aprobada_en) VALUES($1,$2,'Mesa','approved',1,$3,now())`,
        [visit.id, approvedClient, users.admin],
      );
      const [participant] = await db.query(
        `SELECT id_participante id FROM participante WHERE id_visita=$1 AND id_cliente=$2`,
        [visit.id, approvedClient],
      );
      const [account] = await db.query(
        `INSERT INTO cuenta_consumo(id_cliente,id_participante,id_jornada) VALUES($1,$2,$3) RETURNING id_cuenta id`,
        [approvedClient, participant.id, day.id],
      );
      await db.query(
        `INSERT INTO participante(id_visita,id_cliente,alias,estado) VALUES($1,$2,'Pendiente','pending')`,
        [visit.id, pendingClient],
      );
      const [pendingVisit] = await db.query(
        `SELECT id_participante id FROM participante WHERE id_visita=$1 AND id_cliente=$2`,
        [visit.id, pendingClient],
      );
      const [config] = await db.query(
        `SELECT id_configuracion id FROM config_domicilio ORDER BY version DESC LIMIT 1`,
      );
      const [pendingRequest] = await db.query(
        `INSERT INTO solicitud_domicilio(id_cliente,id_jornada,id_configuracion,destinatario,telefono,direccion,tarifa_ctvs,estado) VALUES($1,$2,$3,'Pendiente','0990000000','Dirección de prueba',0,'pending') RETURNING id_solicitud id`,
        [pendingClient, day.id, config.id],
      );
      const [approvedRequest] = await db.query(
        `INSERT INTO solicitud_domicilio(id_cliente,id_jornada,id_configuracion,destinatario,telefono,direccion,tarifa_ctvs,estado,decidida_en,decidida_por) VALUES($1,$2,$3,'Aprobada','0990000001','Otra dirección',0,'approved',now(),$4) RETURNING id_solicitud id`,
        [approvedClient, day.id, config.id, users.admin],
      );

      const [reward] = await db.query(
        `SELECT id_recompensa id,id_producto product FROM recompensa ORDER BY id_recompensa LIMIT 1`,
      );
      const [inventory] = await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,cantidad_reservada,inicializado_por) VALUES($1,$2,2,2,1,$3) RETURNING id_inventario id`,
        [day.id, reward.product, users.admin],
      );
      const [redemption] = await db.query(
        `INSERT INTO solicitud_canje(id_cliente,id_participante,id_cuenta,id_visita,id_jornada,id_recompensa,version_recompensa,id_producto,controla_stock,costo_puntos,expira_en,creado_por) VALUES($1,$2,$3,$4,$5,$6,1,$7,true,10,now()+interval '15 minutes',$8) RETURNING id_canje id`,
        [
          approvedClient,
          participant.id,
          account.id,
          visit.id,
          day.id,
          reward.id,
          reward.product,
          users.admin,
        ],
      );
      await db.query(
        `INSERT INTO reserva_puntos_canje(id_canje,id_cliente,puntos) VALUES($1,$2,10)`,
        [redemption.id, approvedClient],
      );
      await db.query(
        `INSERT INTO reserva_inventario_canje(id_canje,id_inventario) VALUES($1,$2)`,
        [redemption.id, inventory.id],
      );
      await request(http())
        .get(`/api/v1/admin/operations/days/${day.id}/closing-preview`)
        .set('Authorization', auth(tokens.worker))
        .expect(200)
        .then((r) => {
          expect(r.body.canClose).toBe(true);
          expect(r.body.cleanupActions).toMatchObject({
            pendingRedemptions: 1,
            pendingParticipants: 1,
            approvedParticipants: 1,
            openVisits: 1,
            unusedDeliveryRequests: 2,
          });
        });
      await request(http())
        .post(`/api/v1/admin/operations/days/${day.id}/close`)
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '11b-worker-day-close')
        .send({})
        .expect(403);
      const closed = await request(http())
        .post(`/api/v1/admin/operations/days/${day.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-close-old-day')
        .send({ notes: 'Cierre verificado' })
        .expect(200);
      expect(closed.body).toMatchObject({
        operatingDayId: day.id,
        notes: 'Cierre verificado',
      });
      const [released] = await db.query(
        `SELECT s.estado,p.estado AS points_state,r.estado AS stock_state,i.cantidad_reservada,i.cantidad_fisica
         FROM solicitud_canje s JOIN reserva_puntos_canje p ON p.id_canje=s.id_canje
         JOIN reserva_inventario_canje r ON r.id_canje=s.id_canje JOIN inventario_diario i ON i.id_inventario=r.id_inventario WHERE s.id_canje=$1`,
        [redemption.id],
      );
      expect(released).toMatchObject({
        estado: 'cancelled',
        points_state: 'released',
        stock_state: 'released',
        cantidad_reservada: 0,
        cantidad_fisica: 2,
      });
      const history = await db.query(
        `SELECT evento FROM historial_canje WHERE id_canje=$1`,
        [redemption.id],
      );
      expect(history.map((row: { evento: string }) => row.evento)).toEqual([
        'redemption.day_closed',
      ]);
      const replays = await Promise.all([
        request(http())
          .post(`/api/v1/admin/operations/days/${day.id}/close`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '11b-close-old-day')
          .send({ notes: 'Cierre verificado' }),
        request(http())
          .post(`/api/v1/admin/operations/days/${day.id}/close`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '11b-close-old-day')
          .send({ notes: 'Cierre verificado' }),
      ]);
      expect(replays.map((response) => response.status)).toEqual([200, 200]);
      await request(http())
        .post(`/api/v1/admin/operations/days/${day.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-close-old-day')
        .send({ notes: 'Otra observación' })
        .expect(409);
      await request(http())
        .get(`/api/v1/admin/operations/days/${day.id}/closure`)
        .set('Authorization', auth(tokens.worker))
        .expect(200)
        .then((r) => expect(r.body.id).toBe(closed.body.id));
      await request(http())
        .get(`/api/v1/admin/operations/days/${day.id}`)
        .set('Authorization', auth(tokens.worker))
        .expect(200)
        .then((r) =>
          expect(r.body).toMatchObject({
            status: 'closed',
            closureId: closed.body.id,
            closedBy: users.admin,
          }),
        );
      await request(http())
        .get('/api/v1/admin/operating-days?status=closed&page=1&limit=100')
        .set('Authorization', auth(tokens.worker))
        .expect(200)
        .then((r) =>
          expect(
            r.body.items.find((item: { id: string }) => item.id === day.id),
          ).toMatchObject({
            closedBy: users.admin,
            closureId: closed.body.id,
          }),
        );
      await expect(
        db.query(
          `SELECT 1 FROM visita_mesa WHERE id_visita=$1 AND estado='closed'`,
          [visit.id],
        ),
      ).resolves.toHaveLength(1);
      await expect(
        db.query(
          `SELECT 1 FROM participante WHERE id_participante=$1 AND estado='finished'`,
          [participant.id],
        ),
      ).resolves.toHaveLength(1);
      await expect(
        db.query(
          `SELECT 1 FROM participante WHERE id_participante=$1 AND estado='cancelled'`,
          [pendingVisit.id],
        ),
      ).resolves.toHaveLength(1);
      await expect(
        db.query(
          `SELECT 1 FROM cuenta_consumo WHERE id_cuenta=$1 AND estado='closed'`,
          [account.id],
        ),
      ).resolves.toHaveLength(1);
      await expect(
        db.query(
          `SELECT 1 FROM solicitud_domicilio WHERE id_solicitud=ANY($1::uuid[]) AND estado='cancelled'`,
          [[pendingRequest.id, approvedRequest.id]],
        ),
      ).resolves.toHaveLength(2);
      await expect(
        db.query(
          `UPDATE jornada_operativa SET estado='open' WHERE id_jornada=$1`,
          [day.id],
        ),
      ).rejects.toThrow('no puede reabrirse');
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await expect(
          new OperatingDayClosures1795000000000().down(runner),
        ).rejects.toThrow('existen cierres o aperturas excepcionales');
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });

    it('allows only the administrator to open the current day with an audited pending-day exception', async () => {
      const [settings] = await db.query(
        `SELECT zona_horaria AS zone FROM configuracion_operativa WHERE id_configuracion=1`,
      );
      const zones = [
        'Etc/GMT+12',
        'Pacific/Pago_Pago',
        'America/Guayaquil',
        'Pacific/Kiritimati',
        'Etc/GMT-12',
      ];
      let selectedZone: string | undefined;
      for (const zone of zones) {
        const [candidate] = await db.query(
          `SELECT timezone($1,clock_timestamp())::date::text AS date`,
          [zone],
        );
        const [existing] = await db.query(
          `SELECT 1 FROM jornada_operativa WHERE fecha_operativa=$1::date`,
          [candidate.date],
        );
        if (!existing) {
          selectedZone = zone;
          break;
        }
      }
      expect(selectedZone).toBeDefined();
      const [previousDate] = await db.query(
        `SELECT ($1::date-n)::text AS date FROM generate_series(1,1000) AS days(n)
         WHERE NOT EXISTS(SELECT 1 FROM jornada_operativa j WHERE j.fecha_operativa=($1::date-n)) LIMIT 1`,
        [
          (
            await db.query(
              `SELECT timezone($1,clock_timestamp())::date::text AS date`,
              [selectedZone],
            )
          )[0].date,
        ],
      );
      const [pendingDay] = await db.query(
        `INSERT INTO jornada_operativa(fecha_operativa,abierta_por) VALUES($1::date,$2) RETURNING id_jornada id`,
        [previousDate.date, users.admin],
      );
      await request(http())
        .patch('/api/v1/admin/operations/settings')
        .set('Authorization', auth(tokens.admin))
        .send({ timeZone: selectedZone })
        .expect(200);
      await request(http())
        .post('/api/v1/admin/operations/days/open-with-pending-days')
        .set('Authorization', auth(tokens.worker))
        .set('Idempotency-Key', '11b-worker-exception')
        .send({ reason: 'Recuperación excepcional' })
        .expect(403);
      const response = await request(http())
        .post('/api/v1/admin/operations/days/open-with-pending-days')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-admin-exception')
        .send({ reason: 'Recuperación de jornada anterior' })
        .expect(201);
      await request(http())
        .post('/api/v1/admin/operations/days/open-with-pending-days')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-admin-exception')
        .send({ reason: 'Recuperación de jornada anterior' })
        .expect(201);
      await request(http())
        .post('/api/v1/admin/operations/days/open-with-pending-days')
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-admin-exception-different')
        .send({ reason: 'Otra razón' })
        .expect(409);
      await request(http())
        .post('/api/v1/admin/operations/days/open')
        .set('Authorization', auth(tokens.admin))
        .expect(409);
      const [opening] = await db.query(
        `SELECT motivo, jornadas_pendientes FROM apertura_excepcional_jornada WHERE id_jornada=$1`,
        [response.body.id],
      );
      expect(opening.motivo).toBe('Recuperación de jornada anterior');
      expect(opening.jornadas_pendientes).toContain(pendingDay.id);
      await request(http())
        .patch('/api/v1/admin/operations/settings')
        .set('Authorization', auth(tokens.admin))
        .send({ timeZone: settings.zone })
        .expect(200);
    });

    it('rolls back the day closure, visit cleanup and idempotency record when audit insertion fails', async () => {
      const [day] = await db.query(
        `INSERT INTO jornada_operativa(fecha_operativa,abierta_por) VALUES('2020-02-04',$1) RETURNING id_jornada id`,
        [users.admin],
      );
      const [table] = await db.query(
        `INSERT INTO mesa(codigo,qr_hash,qr_version) VALUES($1,$2,1) RETURNING id_mesa id`,
        [`RB-${randomUUID()}`, hashAccessSecret(randomUUID())],
      );
      const [visit] = await db.query(
        `INSERT INTO visita_mesa(id_mesa,id_jornada,abierta_por) VALUES($1,$2,$3) RETURNING id_visita id`,
        [table.id, day.id, users.admin],
      );
      await failAudit('operations.day_closed');
      try {
        await request(http())
          .post(`/api/v1/admin/operations/days/${day.id}/close`)
          .set('Authorization', auth(tokens.admin))
          .set('Idempotency-Key', '11b-rollback-close')
          .send({})
          .expect(500);
      } finally {
        await restoreAudit();
      }
      const [state] = await db.query(
        `SELECT j.estado AS day_status,v.estado AS visit_status,c.id_cierre
         FROM jornada_operativa j JOIN visita_mesa v ON v.id_jornada=j.id_jornada
         LEFT JOIN cierre_jornada c ON c.id_jornada=j.id_jornada WHERE j.id_jornada=$1 AND v.id_visita=$2`,
        [day.id, visit.id],
      );
      expect(state).toMatchObject({
        day_status: 'open',
        visit_status: 'open',
        id_cierre: null,
      });
      await request(http())
        .post(`/api/v1/admin/operations/days/${day.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-rollback-close')
        .send({})
        .expect(200);
    });

    it('blocks a day with an open cash register and links the cash reconciliation to the day closure', async () => {
      const [day] = await db.query(
        `INSERT INTO jornada_operativa(fecha_operativa,abierta_por) VALUES('2020-02-05',$1) RETURNING id_jornada id`,
        [users.admin],
      );
      const [cash] = await db.query(
        `INSERT INTO caja(id_jornada,monto_inicial_ctvs,abierta_por) VALUES($1,5000,$2) RETURNING id_caja id`,
        [day.id, users.admin],
      );
      const preview = await request(http())
        .get(`/api/v1/admin/operations/days/${day.id}/closing-preview`)
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      expect(preview.body.canClose).toBe(false);
      expect(preview.body.counts).toMatchObject({
        openCash: 1,
        cashWithoutClosure: 1,
      });
      await request(http())
        .post(`/api/v1/admin/operations/days/${day.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-open-cash-day-close')
        .send({})
        .expect(409);
      const cashClosure = await request(http())
        .post(`/api/v1/admin/operations/cash/${cash.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-close-cash-before-day')
        .send({ countedCents: 5000 })
        .expect(200);
      const dayClosure = await request(http())
        .post(`/api/v1/admin/operations/days/${day.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-close-after-cash')
        .send({})
        .expect(200);
      expect(dayClosure.body.cashClosureId).toBe(cashClosure.body.id);
    });

    it('reports every pending order, consumption, settlement, transfer, cancellation and reservation as a day blocker', async () => {
      const [day] = await db.query(
        `INSERT INTO jornada_operativa(fecha_operativa,abierta_por) VALUES('2020-02-06',$1) RETURNING id_jornada id`,
        [users.admin],
      );
      const [cash] = await db.query(
        `INSERT INTO caja(id_jornada,monto_inicial_ctvs,abierta_por) VALUES($1,0,$2) RETURNING id_caja id`,
        [day.id, users.admin],
      );
      const [table] = await db.query(
        `INSERT INTO mesa(codigo) VALUES($1) RETURNING id_mesa id`,
        [`B-${randomUUID()}`],
      );
      const [visit] = await db.query(
        `INSERT INTO visita_mesa(id_mesa,id_jornada,abierta_por) VALUES($1,$2,$3) RETURNING id_visita id`,
        [table.id, day.id, users.admin],
      );
      const [clientUser] = await db.query(
        `INSERT INTO usuario(id_rol,correo_normalizado,password_hash) SELECT id_rol,$1,'unused' FROM rol WHERE codigo='client' RETURNING id_usuario id`,
        [`11b-block-${randomUUID()}@test.invalid`],
      );
      const [client] = await db.query(
        `INSERT INTO cliente(id_usuario) VALUES($1) RETURNING id_cliente id`,
        [clientUser.id],
      );
      const [participant] = await db.query(
        `INSERT INTO participante(id_visita,id_cliente,alias,estado,qr_version_aprobada,aprobada_por,aprobada_en) VALUES($1,$2,'Bloqueo','approved',1,$3,now()) RETURNING id_participante id`,
        [visit.id, client.id, users.admin],
      );
      const [account] = await db.query(
        `INSERT INTO cuenta_consumo(id_cliente,id_participante,id_jornada) VALUES($1,$2,$3) RETURNING id_cuenta id`,
        [client.id, participant.id, day.id],
      );
      const [category] = await db.query(
        `SELECT id_categoria id FROM categoria ORDER BY id_categoria LIMIT 1`,
      );
      const [product] = await db.query(
        `INSERT INTO producto(id_categoria,sku,nombre,precio_ctvs,controla_inventario) VALUES($1,$2,'Bloqueador',100,true) RETURNING id_producto id`,
        [category.id, `11b-block-${randomUUID()}`],
      );
      const [inventory] = await db.query(
        `INSERT INTO inventario_diario(id_jornada,id_producto,cantidad_inicial,cantidad_fisica,cantidad_reservada,inicializado_por) VALUES($1,$2,1,1,1,$3) RETURNING id_inventario id`,
        [day.id, product.id, users.admin],
      );
      const [order] = await db.query(
        `INSERT INTO pedido(id_jornada,id_visita,id_cuenta,actor_usuario,modalidad,origen,estado) VALUES($1,$2,$3,$4,'local','client','submitted') RETURNING id_pedido id`,
        [day.id, visit.id, account.id, users.admin],
      );
      const [version] = await db.query(
        `INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs) VALUES($1,1,'current',100) RETURNING id_version id`,
        [order.id],
      );
      const [detail] = await db.query(
        `INSERT INTO detalle_pedido(id_version,id_producto,cantidad,precio_unitario_ctvs,controla_stock_snapshot) VALUES($1,$2,1,100,true) RETURNING id_detalle id`,
        [version.id, product.id],
      );
      const [assignment] = await db.query(
        `INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES($1,$2,1) RETURNING id_asignacion id`,
        [detail.id, account.id],
      );
      await db.query(
        `INSERT INTO reserva_inventario(id_detalle,id_inventario,cantidad) VALUES($1,$2,1)`,
        [detail.id, inventory.id],
      );
      const [settlement] = await db.query(
        `INSERT INTO liquidacion(id_cuenta,id_caja,productos_ctvs,envio_ctvs,total_ctvs,creada_por) VALUES($1,$2,100,0,100,$3) RETURNING id_liquidacion id`,
        [account.id, cash.id, users.admin],
      );
      await db.query(
        `INSERT INTO detalle_liquidacion(id_liquidacion,id_asignacion,cantidad_snapshot,precio_snapshot_ctvs,importe_ctvs) VALUES($1,$2,1,100,100)`,
        [settlement.id, assignment.id],
      );
      await db.query(
        `INSERT INTO pago(id_liquidacion,metodo,estado,importe_ctvs,registrado_usuario,pagador_cliente) VALUES($1,'transfer','pendingVerification',100,$2,$3)`,
        [settlement.id, users.admin, client.id],
      );
      await db.query(
        `INSERT INTO solicitud_cancelacion(id_pedido,id_version,estado_pedido,estado,motivo,actor_usuario) VALUES($1,$2,'submitted','pending','Revisión solicitada',$3)`,
        [order.id, version.id, users.worker],
      );

      const response = await request(http())
        .get(
          `/api/v1/admin/operations/days/${day.id}/closing-preview?page=1&limit=100`,
        )
        .set('Authorization', auth(tokens.worker))
        .expect(200);
      expect(response.body.canClose).toBe(false);
      expect(response.body.counts).toMatchObject({
        openCash: 1,
        cashWithoutClosure: 1,
        unfinishedOrders: 1,
        unsettledConsumption: 1,
        pendingSettlements: 1,
        pendingTransfers: 1,
        pendingCancellations: 1,
        activeOrderReservations: 1,
      });
      expect(
        new Set(
          response.body.blockers.map(
            (blocker: { kind: string }) => blocker.kind,
          ),
        ),
      ).toEqual(
        new Set([
          'openCash',
          'cashWithoutClosure',
          'unfinishedOrders',
          'unsettledConsumption',
          'pendingSettlements',
          'pendingTransfers',
          'pendingCancellations',
          'activeOrderReservations',
        ]),
      );
      await request(http())
        .post(`/api/v1/admin/operations/days/${day.id}/close`)
        .set('Authorization', auth(tokens.admin))
        .set('Idempotency-Key', '11b-all-blockers-close')
        .send({})
        .expect(409);
    });
  },
);
