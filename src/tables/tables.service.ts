import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { hashAccessSecret } from './guest-sessions.service.js';
import { auditTableOperation } from './table-audit.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

@Injectable()
export class TablesService {
  constructor(private readonly db: DataSource) {}

  async createTable(code: string, actor: string) {
    try {
      return await this.db.transaction(async manager => {
        const [table] = await manager.query(`INSERT INTO "mesa" ("codigo") VALUES ($1) RETURNING "id_mesa" AS id,"codigo" AS code,"activa" AS active`, [code.trim().toUpperCase()]);
        await auditTableOperation(manager, { userId: actor }, 'mesa', table.id, 'table.created', table);
        return table;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('El código ya existe.');
      throw error;
    }
  }

  async tables(page = 1, limit = 20) {
    const items = await this.db.query(`SELECT m."id_mesa" AS id,m."codigo" AS code,m."activa" AS active,v."id_visita" AS "openVisitId"
      FROM "mesa" m LEFT JOIN "visita_mesa" v ON v."id_mesa"=m."id_mesa" AND v."estado"='open'
      ORDER BY m."codigo",m."id_mesa" LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]);
    const [{ total }] = await this.db.query('SELECT count(*)::int AS total FROM "mesa"');
    return { items, total, page, limit };
  }

  async openVisit(tableId: string, actor: string) {
    return this.db.transaction(async manager => {
      const timeZone = await lockTableOperations(manager);
      const [day] = await manager.query(`SELECT "id_jornada" AS id FROM "jornada_operativa" WHERE "fecha_operativa"=timezone($1,clock_timestamp())::date AND "estado"='open' FOR UPDATE`, [timeZone]);
      if (!day) throw new ConflictException('No hay jornada abierta para hoy.');
      const [table] = await manager.query(`SELECT "activa" AS active FROM "mesa" WHERE "id_mesa"=$1 FOR UPDATE`, [tableId]);
      if (!table) throw new NotFoundException('Mesa no encontrada.');
      if (!table.active) throw new ConflictException('Mesa inactiva.');
      const [{ current }] = await manager.query(`SELECT "fecha_operativa"=timezone($2,clock_timestamp())::date AS current FROM "jornada_operativa" WHERE "id_jornada"=$1`, [day.id, timeZone]);
      if (!current) throw new ConflictException('Cambió la fecha operativa; abre la jornada actual.');
      const existing = await manager.query(`SELECT "id_visita" FROM "visita_mesa" WHERE "id_mesa"=$1 AND "estado"='open'`, [tableId]);
      if (existing.length) throw new ConflictException('La mesa ya tiene una visita abierta.');
      const [visit] = await manager.query(`INSERT INTO "visita_mesa" ("id_mesa","id_jornada","abierta_por") VALUES ($1,$2,$3) RETURNING "id_visita" AS id,"estado" AS status,"abierta_en" AS "openedAt"`, [tableId, day.id, actor]);
      await manager.query(`UPDATE "mesa" SET "qr_hash"=NULL WHERE "id_mesa"=$1`, [tableId]);
      await auditTableOperation(manager, { userId: actor }, 'visita_mesa', visit.id, 'visit.opened', { tableId, operatingDayId: day.id });
      return visit;
    });
  }

  async issueQr(visitId: string, actor: string) {
    return this.db.transaction(async manager => {
      const timeZone = await lockTableOperations(manager);
      const table = await lockActiveVisit(manager, visitId, timeZone);
      const token = randomBytes(32).toString('base64url');
      const [[row]] = await manager.query(`UPDATE "mesa" SET "qr_hash"=$2,"qr_version"="qr_version"+1 WHERE "id_mesa"=$1 RETURNING "qr_version" AS "qrVersion"`, [table.id, hashAccessSecret(token)]);
      const [cancelled] = await manager.query(`UPDATE "participante" SET "estado"='cancelled',"finalizada_en"=clock_timestamp() WHERE "id_visita"=$1 AND "estado"='pending' RETURNING "id_participante" AS id`, [visitId]);
      await auditTableOperation(manager, { userId: actor }, 'visita_mesa', visitId, 'visit.qr_issued',
        { tableId: table.id, qrVersion: row.qrVersion, cancelledParticipantIds: cancelled.map((p: { id: string }) => p.id) });
      return { visitId, qrToken: token, qrVersion: row.qrVersion };
    });
  }
}
