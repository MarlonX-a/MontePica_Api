import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException, UnsupportedMediaTypeException } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import type { ClientIdentity } from './client-access.guard.js';
import { ParticipantsService } from './participants.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { ReceiptStorageService } from './receipt-storage.service.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';

export type ReceiptFile = { buffer:Buffer; mimetype:string; size:number };
type TransferActor = { userId?:string; guestSessionId?:string };

@Injectable()
export class TransfersService {
  constructor(private readonly db:DataSource,private readonly keys:ParticipationIdempotencyService,private readonly storage:ReceiptStorageService,private readonly participants:ParticipantsService) {}

  private async staff(m:EntityManager,actor:AuthenticatedRequestContext,permission:string) {
    const [s]=await m.query(`SELECT u.activo,s.revocada_en,s.expira_en>clock_timestamp() AS valid FROM usuario u JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 FOR SHARE OF u,s`,[actor.userId,actor.sessionId]);
    if (!s || !s.activo || s.revocada_en || !s.valid) throw new UnauthorizedException('Sesión no válida.');
    const [p]=await m.query(`SELECT 1 FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=$1 AND p.codigo=$2`,[actor.userId,permission]);
    if (!p) throw new ForbiddenException('No tienes permiso para realizar esta acción.');
  }

  private validate(file:ReceiptFile) {
    if (!file?.buffer?.length) throw new BadRequestException('Se requiere un archivo.');
    if (file.buffer.length>5242880) throw new BadRequestException('El archivo supera 5 MiB.');
    const b=file.buffer;
    const kind=b.length>=3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff ? 'image/jpeg' : b.length>=8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : b.subarray(0,5).toString('ascii')==='%PDF-' ? 'application/pdf' : null;
    if (!kind || kind!==file.mimetype) throw new UnsupportedMediaTypeException('El archivo debe ser JPEG, PNG o PDF válido.');
    return {mime:kind,hash:createHash('sha256').update(b).digest('hex')};
  }

  async upload(id:string,file:ReceiptFile,actor:TransferActor,client:ClientIdentity|undefined,staff:AuthenticatedRequestContext|undefined,key?:string) {
    const {mime,hash}=this.validate(file); let uploaded:string|undefined;
    try {
      return await this.keys.run(actor,`settlements/${id.toLowerCase()}/transfer-payments`,key,{mime,sha256:hash,size:file.buffer.length},201,'pago',async m=>{
        if (client) {await this.participants.authenticate(m,client); const [own]=await m.query(`SELECT 1 FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE l.id_liquidacion=$1 AND c.id_cliente=$2`,[id,client.clientId]); if (!own) throw new NotFoundException('Liquidación no encontrada.');}
        if (staff) await this.staff(m,staff,'payments.registerTransfer');
      },async m=>{
        const zone=await lockTableOperations(m);
        const [ref]=await m.query(`SELECT l.id_cuenta,l.id_caja,c.id_cliente FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE l.id_liquidacion=$1`,[id]);
        if (!ref) throw new NotFoundException('Liquidación no encontrada.');
        const [cash]=await m.query(`SELECT c.estado,j.estado AS day_status,j.fecha_operativa=timezone($2,clock_timestamp())::date AS current FROM caja c JOIN jornada_operativa j ON j.id_jornada=c.id_jornada WHERE c.id_caja=$1 FOR UPDATE OF j,c`,[ref.id_caja,zone]);
        if (!cash || cash.estado!=='open' || cash.day_status!=='open' || !cash.current) throw new ConflictException('La caja debe estar abierta en la jornada actual.');
        const [account]=await m.query('SELECT estado FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',[ref.id_cuenta]);
        const [settlement]=await m.query('SELECT estado,total_ctvs::float8 AS total FROM liquidacion WHERE id_liquidacion=$1 FOR UPDATE',[id]);
        if (account.estado!=='open' || settlement.estado!=='pending' || !Number.isSafeInteger(settlement.total) || settlement.total<=0) throw new ConflictException('La liquidación no admite transferencias.');
        const [pending]=await m.query(`SELECT 1 FROM pago WHERE id_liquidacion=$1 AND estado='pendingVerification'`,[id]);
        if (pending) throw new ConflictException('Ya existe una transferencia pendiente.');
        uploaded=this.storage.prefix+randomUUID(); await this.storage.put(uploaded,file.buffer,mime);
        const [payment]=await m.query(`INSERT INTO pago(id_liquidacion,metodo,estado,importe_ctvs,registrado_usuario,registrado_sesion_cliente,pagador_cliente) VALUES ($1,'transfer','pendingVerification',$2,$3,$4,$5) RETURNING id_pago AS id`,[id,settlement.total,actor.userId ?? null,actor.guestSessionId ?? null,ref.id_cliente]);
        await m.query('INSERT INTO comprobante(id_pago,archivo_privado,mime,tamano,sha256) VALUES ($1,$2,$3,$4,$5)',[payment.id,uploaded,mime,file.buffer.length,hash]);
        await m.query(`INSERT INTO historial_pago(id_pago,actor_usuario,actor_sesion_cliente,estado_nuevo,evento) VALUES ($1,$2,$3,'pendingVerification','transfer.submitted')`,[payment.id,actor.userId ?? null,actor.guestSessionId ?? null]);
        await auditTableOperation(m,actor,'pago',payment.id,'transfer.submitted',{settlementId:id,amountCents:settlement.total,mime,size:file.buffer.length});
        return {resourceId:payment.id,response:{id:payment.id,settlementId:id,method:'transfer',status:'pendingVerification',amountCents:settlement.total,receipt:{mime,size:file.buffer.length,sha256:hash}}};
      });
    } catch (error) {
      if (uploaded) {
        try {
          const [referenced]=await this.db.query('SELECT 1 FROM comprobante WHERE archivo_privado=$1',[uploaded]);
          if (!referenced) await this.storage.delete(uploaded);
        } catch { /* The orphan reconciliation command handles failed compensation. */ }
      }
      throw error;
    }
  }

  async decide(id:string,decision:'confirm'|'reject',value:string,actor:AuthenticatedRequestContext,key?:string) {
    const normalized=decision==='confirm'?value.normalize('NFC').trim().toUpperCase():value.trim();
    if (!normalized || normalized.length>(decision==='confirm'?120:500)) throw new BadRequestException('Referencia o motivo inválido.');
    try {
      return await this.keys.run({userId:actor.userId},`payments/${id.toLowerCase()}/${decision}`,key,{value:normalized},200,'pago',m=>this.staff(m,actor,'payments.verify'),async m=>{
        const zone=await lockTableOperations(m);
        const [ref]=await m.query(`SELECT p.id_liquidacion,l.id_cuenta,l.id_caja,c.id_participante,part.id_visita FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta JOIN participante part ON part.id_participante=c.id_participante WHERE p.id_pago=$1`,[id]);
        if (!ref) throw new NotFoundException('Pago no encontrado.');
        if (decision==='confirm') {const [cash]=await m.query(`SELECT c.estado,j.estado AS day_status,j.fecha_operativa=timezone($2,clock_timestamp())::date AS current FROM caja c JOIN jornada_operativa j ON j.id_jornada=c.id_jornada WHERE c.id_caja=$1 FOR UPDATE OF j,c`,[ref.id_caja,zone]); if (!cash || cash.estado!=='open' || cash.day_status!=='open' || !cash.current) throw new ConflictException('La caja debe estar abierta en la jornada actual.');}
        await m.query('SELECT 1 FROM visita_mesa WHERE id_visita=$1 FOR UPDATE',[ref.id_visita]);
        const [participant]=await m.query('SELECT estado FROM participante WHERE id_participante=$1 FOR UPDATE',[ref.id_participante]);
        const [account]=await m.query('SELECT estado FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',[ref.id_cuenta]);
        const [settlement]=await m.query('SELECT estado FROM liquidacion WHERE id_liquidacion=$1 FOR UPDATE',[ref.id_liquidacion]);
        const [payment]=await m.query('SELECT estado,metodo FROM pago WHERE id_pago=$1 FOR UPDATE',[id]);
        if (payment.metodo!=='transfer' || payment.estado!=='pendingVerification' || settlement.estado!=='pending' || account.estado!=='open' || participant.estado!=='approved') throw new ConflictException('El pago ya no está pendiente.');
        const status=decision==='confirm'?'confirmed':'rejected';
        await m.query(`UPDATE pago SET estado=$2,verificado_por=$3,verificado_en=clock_timestamp(),operacion_bancaria_confirmada=$4,motivo_rechazo=$5 WHERE id_pago=$1`,[id,status,actor.userId,decision==='confirm'?normalized:null,decision==='reject'?normalized:null]);
        if (decision==='confirm') {
          await m.query(`UPDATE liquidacion SET estado='settled',cerrada_en=clock_timestamp(),cerrada_por=$2,resolucion='transfer' WHERE id_liquidacion=$1`,[ref.id_liquidacion,actor.userId]);
          await m.query(`UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,[ref.id_cuenta]);
          await m.query(`UPDATE participante SET estado='finished',finalizada_en=clock_timestamp() WHERE id_participante=$1`,[ref.id_participante]);
        }
        await m.query(`INSERT INTO historial_pago(id_pago,actor_usuario,estado_anterior,estado_nuevo,evento) VALUES ($1,$2,'pendingVerification',$3,$4)`,[id,actor.userId,status,`transfer.${decision}`]);
        await auditTableOperation(m,{userId:actor.userId},'pago',id,`transfer.${decision}`,{settlementId:ref.id_liquidacion,reason:decision==='reject'?normalized:null});
        return {resourceId:id,response:{id,settlementId:ref.id_liquidacion,status,settlementStatus:decision==='confirm'?'settled':'pending'}};
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & {driverError?:{code?:string}}).driverError?.code==='23505') throw new ConflictException('La referencia bancaria ya fue confirmada.');
      throw error;
    }
  }

  async receipt(id:string,clientId?:string) {
    const [row]=await this.db.query(`SELECT r.archivo_privado AS key,r.mime FROM comprobante r JOIN pago p ON p.id_pago=r.id_pago JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE p.id_pago=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,[id,clientId ?? null]);
    if (!row) throw new NotFoundException('Comprobante no encontrado.');
    return {mime:row.mime,body:await this.storage.get(row.key)};
  }
}
