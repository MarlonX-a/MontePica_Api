import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import type { ClientIdentity } from './client-access.guard.js';
import type { AdminDeliveryListDto, DeliveryListDto, DeliveryRequestDto, DeliverySettingsDto } from './delivery.dto.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { ParticipantsService } from './participants.service.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';

@Injectable()
export class DeliveryService {
  constructor(private readonly db:DataSource,private readonly keys:ParticipationIdempotencyService,private readonly participants:ParticipantsService) {}

  private async staff(m:EntityManager,actor:AuthenticatedRequestContext,permission:string) {
    const [session]=await m.query(`SELECT u.activo,s.revocada_en,s.expira_en>clock_timestamp() AS valid FROM usuario u JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 FOR SHARE OF u,s`,[actor.userId,actor.sessionId]);
    if (!session || !session.activo || session.revocada_en || !session.valid) throw new UnauthorizedException('Sesión no válida.');
    const [p]=await m.query(`SELECT 1 FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=$1 AND p.codigo=$2`,[actor.userId,permission]);
    if (!p) throw new ForbiddenException('No tienes permiso para realizar esta acción.');
  }

  async settings(m:EntityManager=this.db.manager) {
    const [row]=await m.query(`SELECT id_configuracion AS id,version,comprobante_plazo_seg AS "receiptSubmissionSeconds",habilitado AS enabled,cobertura AS "coverageDescription",tarifa_ctvs::float8 AS "shippingFeeCents",'USD' AS currency,configurada_por AS "configuredBy",creada_en AS "createdAt" FROM config_domicilio ORDER BY version DESC LIMIT 1`);
    return row;
  }

  async updateSettings(dto:DeliverySettingsDto,actor:AuthenticatedRequestContext,key?:string) {
    return this.keys.run({userId:actor.userId},'delivery/settings',key,dto,200,'config_domicilio',m=>this.staff(m,actor,'delivery.configure'),async m=>{
      await lockTableOperations(m); const before=await this.settings(m);
      const [row]=await m.query(`INSERT INTO config_domicilio(version,habilitado,cobertura,tarifa_ctvs,configurada_por,comprobante_plazo_seg) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_configuracion AS id`,[before.version+1,dto.enabled,dto.coverageDescription,dto.shippingFeeCents,actor.userId,dto.receiptSubmissionSeconds]);
      const response=await this.settings(m); await auditTableOperation(m,{userId:actor.userId},'config_domicilio',row.id,'delivery.settings_updated',{before,after:response});
      return {resourceId:row.id,response};
    });
  }

  private async activeDay(m:EntityManager,zone:string) {
    const [day]=await m.query(`SELECT id_jornada AS id FROM jornada_operativa WHERE estado='open' AND fecha_operativa=timezone($1,clock_timestamp())::date FOR UPDATE`,[zone]);
    if (!day) throw new ConflictException('Se requiere la jornada actual abierta.'); return day.id as string;
  }

  async detail(id:string,clientId?:string,m:EntityManager=this.db.manager) {
    const [row]=await m.query(`SELECT s.id_solicitud AS id,s.id_cliente AS "clientId",s.id_jornada AS "operatingDayId",c.version AS "configurationVersion",s.destinatario AS "recipientName",s.telefono AS phone,s.direccion AS address,s.referencias AS references,s.latitud AS latitude,s.longitud AS longitude,s.tarifa_ctvs::float8 AS "shippingFeeCents",'USD' AS currency,s.estado AS status,s.creada_en AS "createdAt",s.decidida_en AS "decidedAt",s.decidida_por AS "decidedBy",s.motivo_rechazo AS "rejectionReason",s.cancelada_en AS "cancelledAt",COALESCE(s.estado='approved' AND j.estado='open' AND j.fecha_operativa=timezone(op.zona_horaria,clock_timestamp())::date AND c.version=(SELECT max(version) FROM config_domicilio) AND c.habilitado,false) AS "usableToday" FROM solicitud_domicilio s JOIN config_domicilio c ON c.id_configuracion=s.id_configuracion JOIN jornada_operativa j ON j.id_jornada=s.id_jornada JOIN configuracion_operativa op ON op.id_configuracion=1 WHERE s.id_solicitud=$1 AND ($2::uuid IS NULL OR s.id_cliente=$2)`,[id,clientId ?? null]);
    if (!row) throw new NotFoundException('Solicitud de domicilio no encontrada.'); return row;
  }

  async list(query:DeliveryListDto,clientId?:string) {
    const admin=query as AdminDeliveryListDto;
    const args=[clientId ?? admin.clientId ?? null,query.status ?? null,admin.operatingDayId ?? null];
    const where=`WHERE ($1::uuid IS NULL OR id_cliente=$1) AND ($2::text IS NULL OR estado=$2) AND ($3::uuid IS NULL OR id_jornada=$3)`;
    const [{total}]=await this.db.query(`SELECT count(*)::int AS total FROM solicitud_domicilio ${where}`,args);
    const rows:Array<{id:string}>=await this.db.query(`SELECT id_solicitud AS id FROM solicitud_domicilio ${where} ORDER BY creada_en DESC,id_solicitud DESC LIMIT $4 OFFSET $5`,[...args,query.limit,(query.page-1)*query.limit]);
    return {items:await Promise.all(rows.map(row=>this.detail(row.id,clientId))),total,page:query.page,limit:query.limit};
  }

  async create(dto:DeliveryRequestDto,client:ClientIdentity,key?:string) {
    if ((dto.latitude===undefined)!==(dto.longitude===undefined)) throw new BadRequestException('Latitud y longitud deben enviarse juntas.');
    return this.keys.run({userId:client.userId},'me/delivery-requests',key,dto,201,'solicitud_domicilio',m=>this.participants.authenticate(m,client),async m=>{
      const zone=await lockTableOperations(m); const settings=await this.settings(m); const day=await this.activeDay(m,zone);
      if (!settings.enabled || settings.version!==dto.configurationVersion) throw new ConflictException('Configuración de domicilio deshabilitada o desactualizada.');
      const [row]=await m.query(`INSERT INTO solicitud_domicilio(id_cliente,id_jornada,id_configuracion,destinatario,telefono,direccion,referencias,latitud,longitud,tarifa_ctvs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_solicitud AS id`,[client.clientId,day,settings.id,dto.recipientName,dto.phone,dto.address,dto.references ?? null,dto.latitude ?? null,dto.longitude ?? null,settings.shippingFeeCents]);
      const response=await this.detail(row.id,client.clientId,m); await auditTableOperation(m,{userId:client.userId},'solicitud_domicilio',row.id,'delivery.requested',{clientId:client.clientId,configurationVersion:settings.version,shippingFeeCents:settings.shippingFeeCents});
      return {resourceId:row.id,response};
    });
  }

  async transition(id:string,action:'approve'|'reject'|'cancel',actor:AuthenticatedRequestContext,client:ClientIdentity|undefined,reason:string|undefined,key?:string) {
    return this.keys.run({userId:actor.userId},`delivery-requests/${id.toLowerCase()}/${action}`,key,{reason:reason ?? null},200,'solicitud_domicilio',async m=>{
      if (client) {await this.participants.authenticate(m,client); await this.detail(id,client.clientId,m);} else await this.staff(m,actor,'delivery.review');
    },async m=>{
      const zone=await lockTableOperations(m); const settings=await this.settings(m);
      const day=action==='approve'?await this.activeDay(m,zone):null;
      const [row]=await m.query(`SELECT s.estado,s.id_jornada,s.id_configuracion,c.version FROM solicitud_domicilio s JOIN config_domicilio c ON c.id_configuracion=s.id_configuracion WHERE s.id_solicitud=$1 FOR UPDATE OF s`,[id]);
      if (!row) throw new NotFoundException('Solicitud de domicilio no encontrada.');
      const [used]=await m.query('SELECT 1 FROM entrega_domicilio WHERE id_solicitud=$1',[id]);
      if (used) throw new ConflictException('La solicitud ya está vinculada a un pedido.');
      if (action==='cancel' ? !['pending','approved'].includes(row.estado) : row.estado!=='pending') throw new ConflictException('La solicitud no permite esa transición.');
      if (action==='approve' && (!settings.enabled || settings.version!==row.version || day!==row.id_jornada)) throw new ConflictException('La solicitud pertenece a otra jornada o configuración.');
      const status=action==='approve'?'approved':action==='reject'?'rejected':'cancelled';
      await m.query(`UPDATE solicitud_domicilio SET estado=$2::varchar,decidida_en=CASE WHEN $2::varchar IN ('approved','rejected') THEN clock_timestamp() ELSE decidida_en END,decidida_por=CASE WHEN $2::varchar IN ('approved','rejected') THEN $3::uuid ELSE decidida_por END,motivo_rechazo=CASE WHEN $2::varchar='rejected' THEN $4::varchar ELSE motivo_rechazo END,cancelada_en=CASE WHEN $2::varchar='cancelled' THEN clock_timestamp() ELSE cancelada_en END WHERE id_solicitud=$1`,[id,status,actor.userId,reason ?? null]);
      const response=await this.detail(id,client?.clientId,m); await auditTableOperation(m,{userId:actor.userId},'solicitud_domicilio',id,`delivery.${action}`,{before:row.estado,after:status,reason:reason ?? null});
      return {resourceId:id,response};
    });
  }
}
