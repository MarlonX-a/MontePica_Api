import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';
import type { AdminPaymentListDto, PaymentListDto } from './payments.dto.js';

@Injectable()
export class PaymentsService {
  constructor(private readonly db:DataSource, private readonly idempotency:ParticipationIdempotencyService) {}

  private async authorize(m:EntityManager,actor:AuthenticatedRequestContext) {
    const [session]=await m.query(`SELECT u.activo,s.revocada_en,s.expira_en>clock_timestamp() AS valid FROM usuario u JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 FOR SHARE OF u,s`,[actor.userId,actor.sessionId]);
    if (!session || !session.activo || session.revocada_en || !session.valid) throw new UnauthorizedException('Sesión no válida.');
    const [permission]=await m.query(`SELECT 1 FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=$1 AND p.codigo='payments.collect'`,[actor.userId]);
    if (!permission) throw new ForbiddenException('No tienes permiso para cobrar.');
  }

  async collect(id:string,receivedCents:number|null,actor:AuthenticatedRequestContext,key?:string) {
    const zero=receivedCents===null;
    return this.idempotency.run({userId:actor.userId},`settlements/${id.toLowerCase()}/${zero?'complete-without-payment':'cash-payments'}`,key,zero?{}:{receivedCents},zero?200:201,'liquidacion',m=>this.authorize(m,actor),async m=>{
      const zone=await lockTableOperations(m);
      const [ref]=await m.query(`SELECT l.id_cuenta,c.id_participante,p.id_visita,l.id_caja FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta JOIN participante p ON p.id_participante=c.id_participante WHERE l.id_liquidacion=$1`,[id]);
      if (!ref) throw new NotFoundException('Liquidación no encontrada.');
      const [cash]=await m.query(`SELECT c.estado,j.estado AS day_status,j.fecha_operativa=timezone($2,clock_timestamp())::date AS current FROM caja c JOIN jornada_operativa j ON j.id_jornada=c.id_jornada WHERE c.id_caja=$1 FOR UPDATE OF j,c`,[ref.id_caja,zone]);
      if (!cash || cash.estado!=='open' || cash.day_status!=='open' || !cash.current) throw new ConflictException('La caja debe estar abierta en la jornada actual.');
      await m.query('SELECT 1 FROM visita_mesa WHERE id_visita=$1 FOR UPDATE',[ref.id_visita]);
      const [participant]=await m.query('SELECT estado FROM participante WHERE id_participante=$1 FOR UPDATE',[ref.id_participante]);
      const [account]=await m.query('SELECT estado FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',[ref.id_cuenta]);
      const [settlement]=await m.query('SELECT estado,total_ctvs::float8 AS total FROM liquidacion WHERE id_liquidacion=$1 FOR UPDATE',[id]);
      if (settlement.estado!=='pending' || account.estado!=='open' || participant.estado!=='approved') throw new ConflictException('La liquidación, cuenta o participación ya no están disponibles.');
      const [pendingTransfer]=await m.query(`SELECT 1 FROM pago WHERE id_liquidacion=$1 AND metodo='transfer' AND estado='pendingVerification'`,[id]);
      if (pendingTransfer) throw new ConflictException('Existe una transferencia pendiente de verificación.');
      if (!Number.isSafeInteger(settlement.total) || (zero ? settlement.total!==0 : settlement.total<=0 || receivedCents!<settlement.total)) throw new ConflictException('Importe insuficiente o liquidación incompatible.');
      let payment=null;
      if (!zero) {
        const [created]=await m.query(`INSERT INTO pago(id_liquidacion,metodo,estado,importe_ctvs,recibido_ctvs,cambio_ctvs,registrado_usuario) VALUES ($1,'cash','confirmed',$2,$3,$4,$5) RETURNING id_pago AS id`,[id,settlement.total,receivedCents,receivedCents!-settlement.total,actor.userId]);
        await m.query(`INSERT INTO historial_pago(id_pago,actor_usuario,estado_nuevo,evento) VALUES ($1,$2,'confirmed','payment.confirmed')`,[created.id,actor.userId]);
        payment=await this.detail(created.id,undefined,true,m);
      }
      await m.query(`UPDATE liquidacion SET estado='settled',cerrada_en=clock_timestamp(),cerrada_por=$2,resolucion=$3 WHERE id_liquidacion=$1`,[id,actor.userId,zero?'zeroTotal':'cash']);
      await m.query(`UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,[ref.id_cuenta]);
      await m.query(`UPDATE participante SET estado='finished',finalizada_en=clock_timestamp() WHERE id_participante=$1`,[ref.id_participante]);
      await auditTableOperation(m,{userId:actor.userId},'liquidacion',id,zero?'settlement.zero_completed':'payment.confirmed',{paymentId:payment?.id ?? null,accountId:ref.id_cuenta,totalCents:settlement.total});
      return {resourceId:id,response:{payment,settlement:{id,status:'settled'},account:{id:ref.id_cuenta,status:'closed'},participant:{id:ref.id_participante,status:'finished'}}};
    });
  }

  async detail(id:string,clientId?:string,admin=false,m:EntityManager=this.db.manager) {
    const [payment]=await m.query(`SELECT p.id_pago AS id,p.id_liquidacion AS "settlementId",l.id_cuenta AS "accountId",l.id_caja AS "cashRegisterId",p.metodo AS method,p.estado AS status,p.importe_ctvs::float8 AS "amountCents",p.recibido_ctvs::float8 AS "receivedCents",p.cambio_ctvs::float8 AS "changeCents",'USD' AS currency,p.creado_en AS "createdAt",p.verificado_en AS "verifiedAt",p.motivo_rechazo AS "rejectionReason" FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE p.id_pago=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,[id,clientId ?? null]);
    if (!payment) throw new NotFoundException('Pago no encontrado.');
    const [receipt]=await m.query(`SELECT mime,tamano AS size,sha256,cargado_en AS "uploadedAt" FROM comprobante WHERE id_pago=$1`,[id]);
    payment.receipt=receipt ?? null;
    if (admin) {
      const [registrar]=await m.query('SELECT registrado_usuario AS "registeredBy",registrado_sesion_cliente AS "registeredByGuestSessionId",verificado_por AS "verifiedBy",operacion_bancaria_confirmada AS "bankOperationReference" FROM pago WHERE id_pago=$1',[id]);
      payment.registeredBy=registrar.registeredBy;
      payment.registeredByGuestSessionId=registrar.registeredByGuestSessionId; payment.verifiedBy=registrar.verifiedBy; payment.bankOperationReference=registrar.bankOperationReference;
      payment.history=await m.query(`SELECT actor_usuario AS "userId",actor_sesion_cliente AS "guestSessionId",evento AS event,estado_anterior AS "previousStatus",estado_nuevo AS "newStatus",ocurrido_en AS "occurredAt" FROM historial_pago WHERE id_pago=$1 ORDER BY ocurrido_en,id_historial_pago`,[id]);
    }
    return payment;
  }

  async list(query:PaymentListDto,clientId?:string) {
    const admin=query as AdminPaymentListDto;
    const args=[clientId ?? null,query.settlementId ?? null,admin.cashRegisterId ?? null,admin.accountId ?? null,query.method ?? null,query.status ?? null];
    const from=`FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE ($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::uuid IS NULL OR l.id_liquidacion=$2) AND ($3::uuid IS NULL OR l.id_caja=$3) AND ($4::uuid IS NULL OR l.id_cuenta=$4) AND ($5::text IS NULL OR p.metodo=$5) AND ($6::text IS NULL OR p.estado=$6)`;
    const [{total}]=await this.db.query(`SELECT count(*)::int AS total ${from}`,args);
    const rows:Array<{id:string}>=await this.db.query(`SELECT p.id_pago AS id ${from} ORDER BY p.creado_en DESC,p.id_pago DESC LIMIT $7 OFFSET $8`,[...args,query.limit,(query.page-1)*query.limit]);
    return {items:await Promise.all(rows.map(row=>this.detail(row.id,clientId))),total,page:query.page,limit:query.limit};
  }
}
