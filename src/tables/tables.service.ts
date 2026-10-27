import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';

@Injectable()
export class TablesService {
  constructor(private readonly db: DataSource) {}

  async createGuest(name:string, phone?:string) {
    const label=name?.trim(); if(!label || label.length>160) throw new BadRequestException('Nombre inválido.');
    const token=`guest_${randomBytes(32).toString('base64url')}`; const hash=createHash('sha256').update(token).digest('hex');
    return this.db.transaction(async m=>{ const [c]=await m.query(`INSERT INTO "cliente" ("nombre_contacto","telefono") VALUES ($1,$2) RETURNING "id_cliente" AS id,"nombre_contacto" AS name,"telefono" AS phone`,[label,phone?.trim()||null]);
      const [s]=await m.query(`INSERT INTO "sesion_cliente" ("id_cliente","token_hash","expira_en") VALUES ($1,$2,now()+interval '24 hours') RETURNING "id_sesion_cliente" AS id,"expira_en" AS "expiresAt"`,[c.id,hash]); return {client:c,token,sessionId:s.id,expiresAt:s.expiresAt}; });
  }

  async leaveGuest(hash:string) { await this.db.query(`UPDATE "sesion_cliente" SET "revocada_en"=now() WHERE "token_hash"=$1 AND "revocada_en" IS NULL`,[hash]); }

  async requestParticipation(visitId:string, clientId:string, sessionId:string|null, alias:string, token:string) {
    const label=alias?.trim(); if(!label || label.length>80) throw new BadRequestException('Alias inválido.');
    const qrHash=createHash('sha256').update(token).digest('hex');
    return this.db.transaction(async m=>{const [v]=await m.query(`SELECT v."id_visita",v."id_jornada",m."qr_version" FROM "visita_mesa" v JOIN "mesa" m ON m."id_mesa"=v."id_mesa" WHERE v."id_visita"=$1 AND v."estado"='open' AND m."qr_hash"=$2 FOR UPDATE OF v,m`,[visitId,qrHash]);
      if(!v) throw new NotFoundException('QR o visita no disponible.');
      const [r]=await m.query(`INSERT INTO "participante" ("id_visita","id_cliente","sesion_origen_id","alias","qr_version_aprobada") VALUES ($1,$2,$3,$4,$5) RETURNING "id_participante" AS id,"estado" AS status,"alias"`,[visitId,clientId,sessionId,label,v.qr_version]); return r; });
  }

  async approve(participantId:string, actor:string) { return this.db.transaction(async m=>{const [p]=await m.query(`SELECT p.*,v."id_jornada",v."estado" AS "visitStatus",v."id_visita" FROM "participante" p JOIN "visita_mesa" v ON v."id_visita"=p."id_visita" WHERE p."id_participante"=$1 FOR UPDATE OF p,v`,[participantId]); if(!p) throw new NotFoundException('Solicitud inexistente.'); if(p.estado!=='pending'||p.visitStatus!=='open') throw new ConflictException('Solicitud ya no está pendiente.');
    const [a]=await m.query(`UPDATE "participante" SET "estado"='approved',"aprobada_por"=$2,"aprobada_en"=now() WHERE "id_participante"=$1 RETURNING "id_cliente"`,[participantId,actor]);
    const [c]=await m.query(`INSERT INTO "cuenta_consumo" ("id_cliente","id_participante","id_jornada") VALUES ($1,$2,$3) RETURNING "id_cuenta" AS id,"estado" AS status`,[a.id_cliente,participantId,p.id_jornada]); return {participantId,status:'approved',account:c};}); }

  async createTable(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!normalized || normalized.length > 40) throw new BadRequestException('Código inválido.');
    try { const [row] = await this.db.query('INSERT INTO "mesa" ("codigo") VALUES ($1) RETURNING "id_mesa" AS id,"codigo" AS code,"activa" AS active', [normalized]); return row; }
    catch (e) { if ((e as { code?: string }).code === '23505') throw new ConflictException('El código ya existe.'); throw e; }
  }

  async tables(page=1, limit=20) {
    const rows = await this.db.query(`SELECT m."id_mesa" AS id,m."codigo" AS code,m."activa" AS active,
      v."id_visita" AS "openVisitId" FROM "mesa" m LEFT JOIN "visita_mesa" v ON v."id_mesa"=m."id_mesa" AND v."estado"='open'
      ORDER BY m."codigo",m."id_mesa" LIMIT $1 OFFSET $2`, [limit,(page-1)*limit]);
    const [{total}] = await this.db.query('SELECT count(*)::int AS total FROM "mesa"'); return {items:rows,total,page,limit};
  }

  async openVisit(tableId:string, actor:string) {
    return this.db.transaction(async m=>{
      const [table] = await m.query('SELECT * FROM "mesa" WHERE "id_mesa"=$1 FOR UPDATE',[tableId]);
      if (!table || !table.activa) throw new NotFoundException('Mesa no disponible.');
      const [day] = await m.query(`SELECT j."id_jornada" AS id FROM "jornada_operativa" j JOIN "configuracion_operativa" c ON c."id_configuracion"=1
        WHERE j."fecha_operativa"=timezone(c."zona_horaria",now())::date AND j."estado"='open' FOR UPDATE OF j`);
      if (!day) throw new ConflictException('No hay jornada abierta para hoy.');
      try { const [visit] = await m.query(`INSERT INTO "visita_mesa" ("id_mesa","id_jornada","abierta_por") VALUES ($1,$2,$3) RETURNING "id_visita" AS id,"estado" AS status,"abierta_en" AS "openedAt"`,[tableId,day.id,actor]); return visit; }
      catch(e) { if ((e as {code?:string}).code==='23505') throw new ConflictException('La mesa ya tiene una visita abierta.'); throw e; }
    });
  }

  async issueQr(visitId:string) {
    const token=randomBytes(32).toString('base64url');
    const [row]=await this.db.query(`UPDATE "mesa" m SET "qr_hash"=$2,"qr_version"="qr_version"+1 FROM "visita_mesa" v
      WHERE v."id_visita"=$1 AND v."id_mesa"=m."id_mesa" AND v."estado"='open' RETURNING v."id_visita" AS "visitId",m."qr_version" AS "qrVersion"`,[visitId,createHash('sha256').update(token).digest('hex')]);
    if (!row) throw new NotFoundException('Visita abierta no encontrada.');
    await this.db.query(`UPDATE "participante" SET "estado"='cancelled',"finalizada_en"=now() WHERE "id_visita"=$1 AND "estado"='pending'`,[visitId]);
    return {...row,qrToken:token};
  }

  async resolveQr(token:string) {
    const hash=createHash('sha256').update(token).digest('hex');
    const [row]=await this.db.query(`SELECT v."id_visita" AS "visitId",m."codigo" AS "tableCode",m."qr_version" AS "qrVersion"
      FROM "mesa" m JOIN "visita_mesa" v ON v."id_mesa"=m."id_mesa" WHERE m."qr_hash"=$1 AND v."estado"='open' AND m."activa"=true`,[hash]);
    if(!row) throw new NotFoundException('QR vencido o inválido.'); return row;
  }
}
