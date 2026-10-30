import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { ClientIdentity } from './client-access.guard.js';
import type { ParticipantQueryDto, RequestParticipationDto, VisitsQueryDto } from './dto/participation.dto.js';
import { hashAccessSecret } from './guest-sessions.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { auditTableOperation, type TableActor } from './table-audit.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

const participantColumns = `p."id_participante" AS id,p."id_visita" AS "visitId",p."id_cliente" AS "clientId",
 p."alias",p."estado" AS status,p."qr_version_aprobada" AS "requestedQrVersion",p."solicitada_en" AS "requestedAt",
 p."aprobada_en" AS "approvedAt",p."finalizada_en" AS "finishedAt",p."motivo_rechazo" AS "rejectionReason",
 CASE WHEN c."id_cuenta" IS NULL THEN NULL ELSE json_build_object('id',c."id_cuenta",'status',c."estado",'modality',c."modalidad",'createdAt',c."creada_en",'closedAt',c."cerrada_en") END AS account`;

@Injectable()
export class ParticipantsService {
  constructor(private readonly db: DataSource, private readonly idempotency: ParticipationIdempotencyService) {}

  private async authenticate(manager: EntityManager, actor: ClientIdentity, participantId?: string) {
    const rows = actor.guestSessionId
      ? await manager.query(`SELECT 1 FROM "sesion_cliente" WHERE "id_sesion_cliente"=$1 AND "id_cliente"=$2 AND "revocada_en" IS NULL AND "expira_en">clock_timestamp() FOR SHARE`, [actor.guestSessionId, actor.clientId])
      : await manager.query(`SELECT 1 FROM "cliente" c JOIN "usuario" u ON u."id_usuario"=c."id_usuario" JOIN "rol" r ON r."id_rol"=u."id_rol" JOIN "sesion_usuario" s ON s."id_usuario"=u."id_usuario" WHERE c."id_cliente"=$1 AND u."id_usuario"=$2 AND u."activo" AND r."codigo"='client' AND s."id_sesion_usuario"=$3 AND s."revocada_en" IS NULL AND s."expira_en">clock_timestamp() FOR SHARE OF u,s`, [actor.clientId, actor.userId, actor.userSessionId]);
    if (!rows.length) throw new UnauthorizedException('Sesión no válida.');
    if (participantId) {
      const own = await manager.query('SELECT 1 FROM "participante" WHERE "id_participante"=$1 AND "id_cliente"=$2', [participantId, actor.clientId]);
      if (!own.length) throw new NotFoundException('Participación no encontrada.');
    }
  }

  private actor(identity: ClientIdentity): TableActor { return identity.guestSessionId ? { guestSessionId: identity.guestSessionId } : { userId: identity.userId }; }

  async request(visitId: string, dto: RequestParticipationDto, actor: ClientIdentity, key?: string) {
    const operation = `visits/${visitId.toLowerCase()}/participants`;
    return this.idempotency.run(this.actor(actor), operation, key, { alias: dto.alias, qrToken: dto.qrToken }, 201, 'participante',
      m => this.authenticate(m, actor), async m => {
        const zone = await lockTableOperations(m);
        const table = await lockActiveVisit(m, visitId, zone);
        if (!table.qrHash || table.qrHash !== hashAccessSecret(dto.qrToken)) throw new NotFoundException('QR vencido o inválido.');
        await m.query('SELECT "id_cliente" FROM "cliente" WHERE "id_cliente"=$1 FOR UPDATE', [actor.clientId]);
        const duplicate = await m.query('SELECT 1 FROM "participante" WHERE "id_visita"=$1 AND "id_cliente"=$2', [visitId, actor.clientId]);
        if (duplicate.length) throw new ConflictException('Ya existe una participación en esta visita.');
        const [p] = await m.query(`INSERT INTO "participante" ("id_visita","id_cliente","sesion_origen_id","solicitada_desde","alias","qr_version_aprobada")
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING "id_participante" AS id`, [visitId, actor.clientId, actor.guestSessionId ?? null, actor.userId ?? null, dto.alias, table.qrVersion]);
        const response = await this.getParticipant(m, p.id);
        await auditTableOperation(m, this.actor(actor), 'participante', p.id, 'participant.requested', { visitId, clientId: actor.clientId, alias: dto.alias, qrVersion: table.qrVersion });
        return { resourceId: p.id, response };
      });
  }

  async getParticipant(manager: EntityManager, id: string, clientId?: string) {
    const [item] = await manager.query(`SELECT ${participantColumns} FROM "participante" p LEFT JOIN "cuenta_consumo" c ON c."id_participante"=p."id_participante" WHERE p."id_participante"=$1 AND ($2::uuid IS NULL OR p."id_cliente"=$2)`, [id, clientId ?? null]);
    if (!item) throw new NotFoundException('Participación no encontrada.');
    return item;
  }

  detail(id: string, actor: ClientIdentity) { return this.getParticipant(this.db.manager, id, actor.clientId); }

  async participants(query: ParticipantQueryDto, filter: { clientId?: string; visitId?: string }) {
    if (filter.visitId) {
      const exists = await this.db.query('SELECT 1 FROM "visita_mesa" WHERE "id_visita"=$1', [filter.visitId]);
      if (!exists.length) throw new NotFoundException('Visita no encontrada.');
    }
    const where = `($1::uuid IS NULL OR p."id_cliente"=$1) AND ($2::uuid IS NULL OR p."id_visita"=$2) AND ($3::text IS NULL OR p."estado"=$3)`;
    const args = [filter.clientId ?? null, filter.visitId ?? null, query.status ?? null];
    const [{ total }] = await this.db.query(`SELECT count(*)::int AS total FROM "participante" p WHERE ${where}`, args);
    const items = await this.db.query(`SELECT ${participantColumns} FROM "participante" p LEFT JOIN "cuenta_consumo" c ON c."id_participante"=p."id_participante" WHERE ${where} ORDER BY p."solicitada_en" DESC,p."id_participante" DESC LIMIT $4 OFFSET $5`, [...args, query.limit, (query.page - 1) * query.limit]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async visits(query: VisitsQueryDto) {
    const where = `($1::uuid IS NULL OR v."id_mesa"=$1) AND ($2::uuid IS NULL OR v."id_jornada"=$2) AND ($3::text IS NULL OR v."estado"=$3)`;
    const args = [query.tableId ?? null, query.operatingDayId ?? null, query.status ?? null];
    const [{ total }] = await this.db.query(`SELECT count(*)::int AS total FROM "visita_mesa" v WHERE ${where}`, args);
    const items = await this.db.query(`SELECT v."id_visita" AS id,v."id_mesa" AS "tableId",v."id_jornada" AS "operatingDayId",v."estado" AS status,v."abierta_en" AS "openedAt",v."cerrada_en" AS "closedAt",v."abierta_por" AS "openedBy",v."cerrada_por" AS "closedBy" FROM "visita_mesa" v WHERE ${where} ORDER BY v."abierta_en" DESC,v."id_visita" DESC LIMIT $4 OFFSET $5`, [...args, query.limit, (query.page-1)*query.limit]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async visit(id: string) {
    const [row] = await this.db.query(`SELECT "id_visita" AS id,"id_mesa" AS "tableId","id_jornada" AS "operatingDayId","estado" AS status,"abierta_en" AS "openedAt","cerrada_en" AS "closedAt","abierta_por" AS "openedBy","cerrada_por" AS "closedBy" FROM "visita_mesa" WHERE "id_visita"=$1`, [id]);
    if (!row) throw new NotFoundException('Visita no encontrada.'); return row;
  }

  async transition(id: string, mode: 'approve' | 'reject' | 'finish' | 'leave', actor: TableActor, key?: string, reason?: string, client?: ClientIdentity) {
    const operation = `participants/${id.toLowerCase()}/${mode}`;
    const auth = async (m: EntityManager) => { if (client) await this.authenticate(m, client, id); };
    return this.idempotency.run(actor, operation, key, { reason: reason ?? null }, 200, 'participante', auth, async m => {
      const zone = await lockTableOperations(m);
      const [ref] = await m.query('SELECT "id_visita" AS "visitId","id_cliente" AS "clientId" FROM "participante" WHERE "id_participante"=$1', [id]);
      if (!ref) throw new NotFoundException('Participación no encontrada.');
      if (mode === 'approve') await lockActiveVisit(m, ref.visitId, zone);
      else await this.lockVisit(m, ref.visitId);
      await m.query('SELECT "id_cliente" FROM "cliente" WHERE "id_cliente"=$1 FOR UPDATE', [ref.clientId]);
      const [p] = await m.query('SELECT * FROM "participante" WHERE "id_participante"=$1 FOR UPDATE', [id]);
      if (mode === 'approve') {
        if (p.estado !== 'pending') throw new ConflictException('La solicitud ya no está pendiente.');
        const [v] = await m.query(`SELECT v."id_jornada" AS "dayId",m."qr_version" AS version FROM "visita_mesa" v JOIN "mesa" m ON m."id_mesa"=v."id_mesa" WHERE v."id_visita"=$1`, [ref.visitId]);
        if (p.qr_version_aprobada !== v.version) throw new ConflictException('El QR ha sido renovado.');
        if (p.sesion_origen_id) {
          const valid = await m.query(`SELECT 1 FROM "sesion_cliente" WHERE "id_sesion_cliente"=$1 AND "revocada_en" IS NULL AND "expira_en">clock_timestamp() FOR SHARE`, [p.sesion_origen_id]);
          if (!valid.length) throw new ConflictException('La sesión invitada de origen ya no está vigente.');
        }
        const active = await m.query(`SELECT 1 FROM "participante" WHERE "id_cliente"=$1 AND "estado"='approved'`, [ref.clientId]);
        if (active.length) throw new ConflictException('El cliente ya participa en otra mesa.');
        await m.query(`UPDATE "participante" SET "estado"='approved',"aprobada_por"=$2,"aprobada_en"=clock_timestamp() WHERE "id_participante"=$1`, [id, actor.userId]);
        await m.query(`INSERT INTO "cuenta_consumo" ("id_cliente","id_participante","id_jornada") VALUES ($1,$2,$3)`, [ref.clientId, id, v.dayId]);
      } else {
        if (mode === 'reject' && p.estado !== 'pending' || mode === 'finish' && p.estado !== 'approved' || mode === 'leave' && !['pending','approved'].includes(p.estado)) throw new ConflictException('Transición de participación no permitida.');
        const next = mode === 'reject' ? 'rejected' : p.estado === 'pending' ? 'cancelled' : 'finished';
        await m.query(`UPDATE "participante" SET "estado"=$2,"finalizada_en"=clock_timestamp(),"motivo_rechazo"=$3 WHERE "id_participante"=$1`, [id, next, reason ?? null]);
        if (next === 'finished') await m.query(`UPDATE "cuenta_consumo" SET "estado"='closed',"cerrada_en"=clock_timestamp() WHERE "id_participante"=$1 AND "estado"='open'`, [id]);
      }
      const response = await this.getParticipant(m, id, client?.clientId);
      await auditTableOperation(m, actor, 'participante', id, `participant.${mode}`, { before: p.estado, after: response.status, reason: reason ?? null });
      return { resourceId: id, response };
    });
  }

  private async lockVisit(m: EntityManager, visitId: string) {
    const [ref] = await m.query('SELECT "id_jornada","id_mesa" FROM "visita_mesa" WHERE "id_visita"=$1', [visitId]);
    if (!ref) throw new NotFoundException('Visita no encontrada.');
    await m.query('SELECT 1 FROM "jornada_operativa" WHERE "id_jornada"=$1 FOR UPDATE', [ref.id_jornada]);
    await m.query('SELECT 1 FROM "mesa" WHERE "id_mesa"=$1 FOR UPDATE', [ref.id_mesa]);
    const [visit] = await m.query('SELECT "estado" FROM "visita_mesa" WHERE "id_visita"=$1 FOR UPDATE', [visitId]);
    if (visit.estado !== 'open') throw new ConflictException('La visita está cerrada.');
    return ref;
  }

  async close(id: string, actor: TableActor, key?: string) {
    return this.idempotency.run(actor, `visits/${id.toLowerCase()}/close`, key, {}, 200, 'visita_mesa', async () => {}, async m => {
      await lockTableOperations(m); const ref = await this.lockVisit(m, id);
      const participants = await m.query(`SELECT "id_participante" AS id,"estado" AS status FROM "participante" WHERE "id_visita"=$1 AND "estado" IN ('pending','approved') ORDER BY "id_cliente","id_participante" FOR UPDATE`, [id]);
      await m.query(`UPDATE "cuenta_consumo" SET "estado"='closed',"cerrada_en"=clock_timestamp() WHERE "id_participante" IN (SELECT "id_participante" FROM "participante" WHERE "id_visita"=$1 AND "estado"='approved') AND "estado"='open'`, [id]);
      await m.query(`UPDATE "participante" SET "estado"=CASE WHEN "estado"='pending' THEN 'cancelled' ELSE 'finished' END,"finalizada_en"=clock_timestamp() WHERE "id_visita"=$1 AND "estado" IN ('pending','approved')`, [id]);
      const [[visit]] = await m.query(`UPDATE "visita_mesa" SET "estado"='closed',"cerrada_en"=clock_timestamp(),"cerrada_por"=$2 WHERE "id_visita"=$1 RETURNING "id_visita" AS id,"estado" AS status,"cerrada_en" AS "closedAt"`, [id, actor.userId]);
      await m.query('UPDATE "mesa" SET "qr_hash"=NULL WHERE "id_mesa"=$1', [ref.id_mesa]);
      await auditTableOperation(m, actor, 'visita_mesa', id, 'visit.closed', { participants });
      return { resourceId: id, response: visit };
    });
  }
}
