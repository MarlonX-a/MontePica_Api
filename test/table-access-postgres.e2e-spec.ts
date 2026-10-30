import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createDatabaseOptions } from '../src/database/database.options.js';
import { configureApp } from '../src/app.setup.js';
import { GuestSessionsService, hashAccessSecret } from '../src/tables/guest-sessions.service.js';
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

// Opt-in only: credentials from .env are used against postgres to CREATE a fresh, disposable database.
// Never connects to DB_NAME from .env. Requires CREATEDB; no migrations are applied to MontePica.
describe.skipIf(process.env.RUN_POSTGRES_E2E !== '1')('Table access against isolated PostgreSQL', () => {
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
  const http = () => app.getHttpServer();
  const auth = (token: string) => `Bearer ${token}`;

  beforeAll(async () => {
    const credentials = parse(readFileSync('.env'));
    const env = { ...credentials, NODE_ENV: 'test', DB_NAME: databaseName, DB_LOGGING: 'false',
      JWT_ACCESS_SECRET: 'postgres-test-secret-at-least-32-bytes-long', CORS_ORIGINS: '' };
    const options = createDatabaseOptions(env);
    control = new DataSource({ ...options, database: 'postgres', entities: [], migrations: [] });
    await control.initialize();
    await control.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    db = new DataSource({ ...options, migrations: [CreateCatalogTables1792080000000, CreateIdentityTables1792340000000,
      CreatePermissionsAndAudit1792600000000, AllowUncategorizedProducts1793200000000, RequireProductCategory1793300000000,
      CreateOperationsOpening1793400000000, CreateDailyInventory1793500000000, CreateTableVisits1793600000000] });
    await db.initialize();
    await db.runMigrations();
    // Empty-database up/down/up check; never revert a database containing user data.
    await db.undoLastMigration();
    await db.runMigrations();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(db).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    guests = app.get(GuestSessionsService); tables = app.get(TablesService); access = app.get(TableAccessService);
    for (const role of ['admin', 'worker', 'client']) {
      const [user] = await db.query(`INSERT INTO usuario (id_rol,correo_normalizado,password_hash)
        SELECT id_rol,$2,'test-unused-password-hash' FROM rol WHERE codigo=$1 RETURNING id_usuario`, [role, `${role}@test.invalid`]);
      users[role] = user.id_usuario;
      await db.query(`INSERT INTO perfil (id_usuario,nombres) VALUES ($1,$2)`, [user.id_usuario, role]);
      if (role === 'client') await db.query(`INSERT INTO cliente (id_usuario) VALUES ($1)`, [user.id_usuario]);
      const [session] = await db.query(`INSERT INTO sesion_usuario (id_usuario,refresh_hash,expira_en) VALUES ($1,$2,now()+interval '1 day') RETURNING id_sesion_usuario`, [user.id_usuario, hashAccessSecret(randomUUID())]);
      tokens[role] = await app.get(JwtService).signAsync({ sub: user.id_usuario, sid: session.id_sesion_usuario, av: 0 });
    }
    const [day] = await db.query(`INSERT INTO jornada_operativa (fecha_operativa,abierta_por)
      SELECT timezone(zona_horaria,clock_timestamp())::date,$1 FROM configuracion_operativa RETURNING id_jornada`, [users.admin]);
    dayId = day.id_jornada;
  }, 60000);

  afterAll(async () => {
    try { if (app) await app.close(); }
    finally {
      if (db?.isInitialized) await db.destroy();
      if (control?.isInitialized) {
        if (created) {
          await control.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [databaseName]);
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
    await db.query(`CREATE TRIGGER test_audit_failure BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`);
  }
  async function restoreAudit() {
    await db.query('DROP TRIGGER test_audit_failure ON auditoria');
    await db.query('DROP FUNCTION reject_test_audit()');
  }

  it('creates a normalized guest, stores only its hash and audits without secrets', async () => {
    const res = await request(http()).post('/api/v1/guest-sessions').send({ name: '  Invitada  ', phone: ' 123 ' }).expect(201);
    expect(res.body.client.name).toBe('Invitada'); expect(res.body.client.phone).toBe('123');
    expect(res.body.token).toMatch(/^guest_[A-Za-z0-9_-]{43}$/);
    const [session] = await db.query('SELECT * FROM sesion_cliente WHERE id_sesion_cliente=$1', [res.body.sessionId]);
    expect(session.token_hash).toBe(hashAccessSecret(res.body.token));
    expect(new Date(session.expira_en).getTime() - Date.now()).toBeGreaterThan(86300000);
    const [audit] = await db.query('SELECT * FROM auditoria WHERE recurso_id=$1', [res.body.sessionId]);
    expect(audit.actor_sesion_cliente_id).toBe(res.body.sessionId);
    expect(JSON.stringify(audit)).not.toContain(res.body.token);
    expect(JSON.stringify(audit)).not.toContain(session.token_hash);
  });

  it('rejects invalid bodies and unknown properties', async () => {
    for (const body of [{ name: ' ' }, { name: 12 }, { name: 'Valid', phone: null }, { name: 'Valid', clientId: randomUUID() }]) {
      await request(http()).post('/api/v1/guest-sessions').send(body).expect(400);
    }
    await request(http()).post('/api/v1/admin/tables').set('Authorization', auth(tokens.admin)).send({ code: 'M', extra: true }).expect(400);
    for (const query of ['page=0', 'page=abc', 'limit=101', 'limit=1.5', 'extra=x']) {
      await request(http()).get(`/api/v1/admin/tables?${query}`).set('Authorization', auth(tokens.worker)).expect(400);
    }
    await request(http()).post('/api/v1/admin/tables/not-a-uuid/visits').set('Authorization', auth(tokens.admin)).expect(400);
  });

  it('completes the HTTP flow without a cash register and enforces both identities and permissions', async () => {
    const table = await request(http()).post('/api/v1/admin/tables').set('Authorization', auth(tokens.admin)).send({ code: ' http ' }).expect(201);
    const visit = await request(http()).post(`/api/v1/admin/tables/${table.body.id}/visits`).set('Authorization', auth(tokens.worker)).expect(201);
    const qr = await request(http()).post(`/api/v1/admin/visits/${visit.body.id}/qr`).set('Authorization', auth(tokens.worker)).expect(201);
    const guest = await guests.create({ name: 'Guest' });
    for (const token of [guest.token, tokens.client]) {
      const resolved = await request(http()).post('/api/v1/table-access/resolve').set('Authorization', auth(token)).send({ qrToken: qr.body.qrToken }).expect(200);
      expect(resolved.body).toEqual({ visitId: visit.body.id, tableId: table.body.id, tableCode: 'HTTP', qrVersion: qr.body.qrVersion });
    }
    await request(http()).post('/api/v1/table-access/resolve').send({ qrToken: qr.body.qrToken }).expect(401);
    await request(http()).post('/api/v1/table-access/resolve').set('Authorization', auth(tokens.admin)).send({ qrToken: qr.body.qrToken }).expect(403);
    await request(http()).post('/api/v1/table-access/resolve').set('Authorization', auth(guest.token)).send({ qrToken: qr.body.qrToken, clientId: randomUUID() }).expect(400);
    await request(http()).get('/api/v1/admin/tables').set('Authorization', auth(guest.token)).expect(401);
    await request(http()).get('/api/v1/admin/tables').set('Authorization', auth(tokens.client)).expect(403);
    await request(http()).post('/api/v1/admin/tables').set('Authorization', auth(tokens.worker)).send({ code: 'WORKER' }).expect(403);
    const page = await request(http()).get('/api/v1/admin/tables?page=1&limit=1').set('Authorization', auth(tokens.worker)).expect(200);
    expect(page.body.items).toHaveLength(1); expect(page.body.limit).toBe(1);
    await request(http()).delete('/api/v1/guest-sessions/current').set('Authorization', auth(tokens.client)).expect(401);
    await request(http()).delete('/api/v1/guest-sessions/current').set('Authorization', auth(guest.token)).expect(204);
    await request(http()).delete('/api/v1/guest-sessions/current').set('Authorization', auth(guest.token)).expect(401);
    await request(http()).post('/api/v1/table-access/resolve').set('Authorization', auth(guest.token)).send({ qrToken: qr.body.qrToken }).expect(401);
    const expired = await guests.create({ name: 'Expired' });
    await db.query(`UPDATE sesion_cliente SET creada_en=now()-interval '2 days',expira_en=now()-interval '1 day' WHERE id_sesion_cliente=$1`, [expired.sessionId]);
    await request(http()).post('/api/v1/table-access/resolve').set('Authorization', auth(expired.token)).send({ qrToken: qr.body.qrToken }).expect(401);
    await request(http()).delete('/api/v1/guest-sessions/current').set('Authorization', auth(`guest_${'a'.repeat(43)}`)).expect(401);
    const expiredJwt = await app.get(JwtService).signAsync({ sub: users.client, sid: randomUUID(), av: 0 }, { expiresIn: -1 });
    await request(http()).post('/api/v1/table-access/resolve').set('Authorization', auth(expiredJwt)).send({ qrToken: qr.body.qrToken }).expect(401);
    await db.query('UPDATE usuario SET activo=false WHERE id_usuario=$1', [users.client]);
    try { await request(http()).post('/api/v1/table-access/resolve').set('Authorization', auth(tokens.client)).send({ qrToken: qr.body.qrToken }).expect(401); }
    finally { await db.query('UPDATE usuario SET activo=true WHERE id_usuario=$1', [users.client]); }
  });

  it('serializes QR renewal, invalidates old versions, cancels pending and preserves approved', async () => {
    const { visit, qr } = await fixture();
    const a = await guests.create({ name: 'Pending' }); const b = await guests.create({ name: 'Approved' });
    await db.query(`INSERT INTO participante (id_visita,id_cliente,alias,estado,qr_version_aprobada) VALUES ($1,$2,'Pending','pending',$3),($1,$4,'Approved','approved',$3)`, [visit.id, a.client.id, qr.qrVersion, b.client.id]);
    const renewals = await Promise.all([tables.issueQr(visit.id, users.worker), tables.issueQr(visit.id, users.admin)]);
    expect(renewals.map(r => r.qrVersion).sort()).toEqual([qr.qrVersion + 1, qr.qrVersion + 2]);
    const latest = renewals.reduce((a,b) => a.qrVersion > b.qrVersion ? a : b);
    await expect(access.resolveQr(qr.qrToken)).rejects.toMatchObject({ status: 404 });
    await expect(access.resolveQr(renewals.find(r => r !== latest)!.qrToken)).rejects.toMatchObject({ status: 404 });
    expect((await access.resolveQr(latest.qrToken)).visitId).toBe(visit.id);
    const states = await db.query('SELECT estado FROM participante WHERE id_visita=$1 ORDER BY estado', [visit.id]);
    expect(states.map(s => s.estado)).toEqual(['approved', 'cancelled']);
  });

  it('rejects inactive tables, closed days and stale business dates', async () => {
    const { table, visit, qr } = await fixture();
    const guest = await guests.create({ name: 'Operational' });
    for (const mutate of [
      () => db.query('UPDATE mesa SET activa=false WHERE id_mesa=$1', [table.id]),
      () => db.query(`UPDATE jornada_operativa SET estado='closed' WHERE id_jornada=$1`, [dayId]),
      () => db.query(`UPDATE jornada_operativa SET fecha_operativa=fecha_operativa-1 WHERE id_jornada=$1`, [dayId]),
    ]) {
      await mutate();
      try {
        await request(http()).post('/api/v1/table-access/resolve').set('Authorization', auth(guest.token)).send({ qrToken: qr.qrToken }).expect(409);
        await request(http()).post(`/api/v1/admin/visits/${visit.id}/qr`).set('Authorization', auth(tokens.admin)).expect(409);
      } finally {
        await db.query('UPDATE mesa SET activa=true WHERE id_mesa=$1', [table.id]);
        await db.query(`UPDATE jornada_operativa SET estado='open',fecha_operativa=timezone('America/Guayaquil',clock_timestamp())::date WHERE id_jornada=$1`, [dayId]);
      }
    }
    await db.query(`UPDATE visita_mesa SET estado='closed',cerrada_en=now(),cerrada_por=$2 WHERE id_visita=$1`, [visit.id, users.admin]);
    await expect(access.resolveQr(qr.qrToken)).rejects.toMatchObject({ status: 404 });
    await tables.openVisit(table.id, users.admin);
    const [m] = await db.query('SELECT qr_hash FROM mesa WHERE id_mesa=$1', [table.id]);
    expect(m.qr_hash).toBeNull();
    await expect(access.resolveQr(qr.qrToken)).rejects.toMatchObject({ status: 404 });
  });

  it('rolls back QR renewal and pending cancellation when audit fails', async () => {
    const { visit, qr } = await fixture();
    const guest = await guests.create({ name: 'Pending rollback' });
    await db.query(`INSERT INTO participante (id_visita,id_cliente,alias) VALUES ($1,$2,'Pending')`, [visit.id, guest.client.id]);
    await failAudit('visit.qr_issued');
    try { await expect(tables.issueQr(visit.id, users.admin)).rejects.toThrow('test audit failure'); }
    finally { await restoreAudit(); }
    expect((await access.resolveQr(qr.qrToken)).qrVersion).toBe(qr.qrVersion);
    const [p] = await db.query('SELECT estado FROM participante WHERE id_visita=$1', [visit.id]);
    expect(p.estado).toBe('pending');
  });

  it('uses the configured time zone when the operational date changes', async () => {
    const { visit, qr } = await fixture();
    await db.query(`UPDATE configuracion_operativa SET zona_horaria='Etc/GMT+12'`);
    await db.query(`UPDATE jornada_operativa SET fecha_operativa=timezone('Etc/GMT-14',clock_timestamp())::date WHERE id_jornada=$1`, [dayId]);
    try {
      await expect(access.resolveQr(qr.qrToken)).rejects.toMatchObject({ status: 409 });
      await expect(tables.issueQr(visit.id, users.admin)).rejects.toMatchObject({ status: 409 });
    } finally {
      await db.query(`UPDATE configuracion_operativa SET zona_horaria='America/Guayaquil'`);
      await db.query(`UPDATE jornada_operativa SET fecha_operativa=timezone('America/Guayaquil',clock_timestamp())::date WHERE id_jornada=$1`, [dayId]);
    }
  });

  it('serializes visit opening and rolls back opening and QR invalidation if audit fails', async () => {
    const table = await tables.createTable(`M${++counter}`, users.admin);
    const originalHash = hashAccessSecret('previous-visit-token');
    await db.query('UPDATE mesa SET qr_hash=$2 WHERE id_mesa=$1', [table.id, originalHash]);
    await failAudit('visit.opened');
    try { await expect(tables.openVisit(table.id, users.admin)).rejects.toThrow('test audit failure'); }
    finally { await restoreAudit(); }
    const [m] = await db.query('SELECT qr_hash FROM mesa WHERE id_mesa=$1', [table.id]);
    expect(m.qr_hash).toBe(originalHash);
    const [{ total }] = await db.query('SELECT count(*)::int AS total FROM visita_mesa WHERE id_mesa=$1', [table.id]);
    expect(total).toBe(0);
    const opened = await Promise.allSettled([tables.openVisit(table.id, users.admin), tables.openVisit(table.id, users.worker)]);
    expect(opened.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(opened.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
  });

  it('rolls back guest creation and revocation when audit fails', async () => {
    const [{ count: before }] = await db.query('SELECT count(*)::int AS count FROM cliente');
    await failAudit('guest_session.created');
    try { await expect(guests.create({ name: 'Rollback' })).rejects.toThrow('test audit failure'); }
    finally { await restoreAudit(); }
    const [{ count: after }] = await db.query('SELECT count(*)::int AS count FROM cliente'); expect(after).toBe(before);
    const guest = await guests.create({ name: 'Revocation rollback' });
    const identity = await guests.authenticate(guest.token);
    await failAudit('guest_session.revoked');
    try { await expect(guests.revoke(identity)).rejects.toThrow('test audit failure'); }
    finally { await restoreAudit(); }
    await expect(guests.authenticate(guest.token)).resolves.toEqual(identity);
  });

  it('documents security schemes and limits guest creation requests', async () => {
    const docs = await request(http()).get('/docs-json').expect(200);
    expect(docs.body.paths['/api/v1/table-access/resolve'].post.security).toEqual([{ 'client-token': [] }]);
    expect(docs.body.paths['/api/v1/guest-sessions/current'].delete.security).toEqual([{ 'client-token': [] }]);
    expect(docs.body.paths['/api/v1/visits/{id}/participants']).toBeUndefined();
    let limited = 0;
    for (let i = 0; i < 11; i++) {
      const response = await request(http()).post('/api/v1/guest-sessions').send({ name: 'Rate test' });
      expect([201, 429]).toContain(response.status); if (response.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });
});
