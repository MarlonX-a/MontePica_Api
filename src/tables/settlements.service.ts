import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import type { AccountListDto, AdminAccountListDto, SettlementListDto } from './settlements.dto.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';

@Injectable()
export class SettlementsService {
  constructor(private readonly db: DataSource, private readonly idempotency: ParticipationIdempotencyService) {}

  private async authorize(m: EntityManager, actor: AuthenticatedRequestContext) {
    const [user] = await m.query(`SELECT u.activo,s.revocada_en,s.expira_en>clock_timestamp() AS valid FROM usuario u JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 FOR SHARE OF u,s`,[actor.userId,actor.sessionId]);
    if (!user || !user.activo || user.revocada_en || !user.valid) throw new UnauthorizedException('Sesión no válida.');
    const [permission] = await m.query(`SELECT 1 FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=$1 AND p.codigo='settlements.manage'`,[actor.userId]);
    if (!permission) throw new ForbiddenException('No tienes permiso para realizar esta acción.');
  }

  async account(id:string, clientId?:string, m:EntityManager=this.db.manager) {
    const [account] = await m.query(`SELECT c.id_cuenta AS id,c.id_cliente AS "clientId",c.id_participante AS "participantId",c.id_jornada AS "operatingDayId",p.id_visita AS "visitId",c.estado AS status,c.creada_en AS "createdAt",c.cerrada_en AS "closedAt" FROM cuenta_consumo c JOIN participante p ON p.id_participante=c.id_participante WHERE c.id_cuenta=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,[id,clientId ?? null]);
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    account.items = await m.query(`SELECT a.id_asignacion AS id,o.id_pedido AS "orderId",o.estado AS "orderStatus",d.id_producto AS "productId",p.nombre AS "productName",a.cantidad AS quantity,d.precio_unitario_ctvs AS "unitPriceCents",(a.cantidad::bigint*d.precio_unitario_ctvs)::float8 AS "subtotalCents" FROM asignacion_consumo a JOIN detalle_pedido d ON d.id_detalle=a.id_detalle JOIN producto p ON p.id_producto=d.id_producto JOIN version_pedido v ON v.id_version=d.id_version JOIN pedido o ON o.id_pedido=v.id_pedido WHERE a.id_cuenta=$1 AND a.estado='active' ORDER BY o.enviado_en,o.id_pedido,d.id_producto`,[id]);
    account.totalCents = account.items.reduce((sum:number, item:{subtotalCents:number})=>sum+item.subtotalCents,0); account.currency='USD';
    const [totals]=await m.query(`SELECT COALESCE(sum(CASE WHEN l.resolucion IN ('cash','transfer') THEN d.importe_ctvs ELSE 0 END),0)::float8 AS paid,COALESCE(sum(d.importe_ctvs),0)::float8 AS resolved FROM detalle_liquidacion d JOIN liquidacion l ON l.id_liquidacion=d.id_liquidacion WHERE l.id_cuenta=$1 AND l.estado='settled' AND d.vigente`,[id]);
    account.paidCents=totals.paid; account.pendingCents=account.totalCents-totals.resolved;
    const [pending] = await m.query(`SELECT id_liquidacion AS id,estado AS status,total_ctvs::float8 AS "totalCents" FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,[id]);
    account.pendingSettlement=pending ?? null; return account;
  }

  async settlement(id:string, clientId?:string, m:EntityManager=this.db.manager) {
    const [row] = await m.query(`SELECT l.id_liquidacion AS id,l.id_cuenta AS "accountId",l.id_caja AS "cashRegisterId",l.estado AS status,l.productos_ctvs::float8 AS "productsCents",l.envio_ctvs::float8 AS "shippingCents",l.total_ctvs::float8 AS "totalCents",'USD' AS currency,l.creada_por AS "createdBy",l.creada_en AS "createdAt",l.anulada_por AS "cancelledBy",l.anulada_en AS "cancelledAt",l.motivo_anulacion AS "cancellationReason",l.cerrada_en AS "settledAt",l.resolucion AS resolution,(SELECT id_pago FROM pago WHERE id_liquidacion=l.id_liquidacion AND estado='confirmed') AS "paymentId" FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE l.id_liquidacion=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,[id,clientId ?? null]);
    if (!row) throw new NotFoundException('Liquidación no encontrada.');
    row.items=await m.query(`SELECT d.id_detalle_liquidacion AS id,d.id_asignacion AS "assignmentId",dp.id_producto AS "productId",p.nombre AS "productName",d.cantidad_snapshot AS quantity,d.precio_snapshot_ctvs AS "unitPriceCents",d.importe_ctvs::float8 AS "subtotalCents",d.vigente AS active FROM detalle_liquidacion d JOIN asignacion_consumo a ON a.id_asignacion=d.id_asignacion JOIN detalle_pedido dp ON dp.id_detalle=a.id_detalle JOIN producto p ON p.id_producto=dp.id_producto WHERE d.id_liquidacion=$1 ORDER BY d.id_detalle_liquidacion`,[id]); return row;
  }

  async accounts(query:AccountListDto, clientId?:string) {
    const admin=query as AdminAccountListDto;
    const args=[clientId ?? null,query.status ?? null,admin.operatingDayId ?? null,admin.visitId ?? null];
    const from=`FROM cuenta_consumo c JOIN participante p ON p.id_participante=c.id_participante WHERE ($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::text IS NULL OR c.estado=$2) AND ($3::uuid IS NULL OR c.id_jornada=$3) AND ($4::uuid IS NULL OR p.id_visita=$4)`;
    const [{total}]=await this.db.query(`SELECT count(*)::int AS total ${from}`,args);
    const rows:Array<{id:string}>=await this.db.query(`SELECT c.id_cuenta AS id ${from} ORDER BY c.creada_en DESC,c.id_cuenta DESC LIMIT $5 OFFSET $6`,[...args,query.limit,(query.page-1)*query.limit]);
    return {items:await Promise.all(rows.map(row=>this.account(row.id,clientId))),total,page:query.page,limit:query.limit};
  }

  async settlements(query:SettlementListDto) {
    const args=[query.status ?? null,query.accountId ?? null,query.cashRegisterId ?? null];
    const where=`WHERE ($1::text IS NULL OR estado=$1) AND ($2::uuid IS NULL OR id_cuenta=$2) AND ($3::uuid IS NULL OR id_caja=$3)`;
    const [{total}]=await this.db.query(`SELECT count(*)::int AS total FROM liquidacion ${where}`,args);
    const rows:Array<{id:string}>=await this.db.query(`SELECT id_liquidacion AS id FROM liquidacion ${where} ORDER BY creada_en DESC,id_liquidacion DESC LIMIT $4 OFFSET $5`,[...args,query.limit,(query.page-1)*query.limit]);
    return {items:await Promise.all(rows.map(row=>this.settlement(row.id))),total,page:query.page,limit:query.limit};
  }

  async create(accountId:string,actor:AuthenticatedRequestContext,key?:string) {
    return this.idempotency.run({userId:actor.userId},`accounts/${accountId.toLowerCase()}/settlements`,key,{},201,'liquidacion',m=>this.authorize(m,actor),async m=>{
      const zone=await lockTableOperations(m);
      const [day]=await m.query(`SELECT j.id_jornada AS id,c.id_caja AS cash FROM jornada_operativa j JOIN caja c ON c.id_jornada=j.id_jornada WHERE j.fecha_operativa=timezone($1,clock_timestamp())::date AND j.estado='open' AND c.estado='open' FOR UPDATE OF j,c`,[zone]);
      if (!day) throw new ConflictException('Se requiere jornada y caja actuales abiertas.');
      const [account]=await m.query('SELECT estado FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',[accountId]);
      if (!account) throw new NotFoundException('Cuenta no encontrada.');
      if (account.estado!=='open') throw new ConflictException('La cuenta está cerrada.');
      const [existing]=await m.query(`SELECT 1 FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,[accountId]);
      if (existing) throw new ConflictException('La cuenta ya tiene una liquidación pendiente.');
      const [unfinished]=await m.query(`SELECT 1 FROM pedido WHERE id_cuenta=$1 AND estado NOT IN ('delivered','cancelled') LIMIT 1`,[accountId]);
      if (unfinished) throw new ConflictException('Todos los pedidos deben estar entregados.');
      const items:Array<{id:string;quantity:number;price:number}>=await m.query(`SELECT a.id_asignacion AS id,a.cantidad AS quantity,d.precio_unitario_ctvs AS price FROM asignacion_consumo a JOIN detalle_pedido d ON d.id_detalle=a.id_detalle WHERE a.id_cuenta=$1 AND a.estado='active' ORDER BY a.id_asignacion FOR UPDATE OF a`,[accountId]);
      if (!items.length) throw new ConflictException('La cuenta no tiene consumo pendiente.');
      const total=items.reduce((sum,item)=>sum+item.quantity*item.price,0);
      if (!Number.isSafeInteger(total)) throw new ConflictException('El total supera el límite permitido.');
      const [settlement]=await m.query(`INSERT INTO liquidacion(id_cuenta,id_caja,productos_ctvs,total_ctvs,creada_por) VALUES ($1,$2,$3,$3,$4) RETURNING id_liquidacion AS id`,[accountId,day.cash,total,actor.userId]);
      for (const item of items) await m.query(`INSERT INTO detalle_liquidacion(id_liquidacion,id_asignacion,cantidad_snapshot,precio_snapshot_ctvs,importe_ctvs) VALUES ($1,$2,$3,$4,$5)`,[settlement.id,item.id,item.quantity,item.price,item.quantity*item.price]);
      await auditTableOperation(m,{userId:actor.userId},'liquidacion',settlement.id,'settlement.created',{accountId,cashRegisterId:day.cash,totalCents:total});
      return {resourceId:settlement.id,response:await this.settlement(settlement.id,undefined,m)};
    });
  }

  async cancel(id:string,reason:string,actor:AuthenticatedRequestContext,key?:string) {
    return this.idempotency.run({userId:actor.userId},`settlements/${id.toLowerCase()}/cancel`,key,{reason},200,'liquidacion',m=>this.authorize(m,actor),async m=>{
      await lockTableOperations(m);
      const [ref]=await m.query('SELECT id_cuenta FROM liquidacion WHERE id_liquidacion=$1',[id]);
      if (!ref) throw new NotFoundException('Liquidación no encontrada.');
      await m.query('SELECT 1 FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',[ref.id_cuenta]);
      const [row]=await m.query('SELECT estado FROM liquidacion WHERE id_liquidacion=$1 FOR UPDATE',[id]);
      if (row.estado!=='pending') throw new ConflictException('La liquidación ya fue anulada.');
      const [pendingTransfer]=await m.query(`SELECT 1 FROM pago WHERE id_liquidacion=$1 AND metodo='transfer' AND estado='pendingVerification'`,[id]);
      if (pendingTransfer) throw new ConflictException('Existe una transferencia pendiente de verificación.');
      await m.query(`UPDATE liquidacion SET estado='cancelled',anulada_por=$2,anulada_en=clock_timestamp(),motivo_anulacion=$3 WHERE id_liquidacion=$1`,[id,actor.userId,reason]);
      await m.query('UPDATE detalle_liquidacion SET vigente=false WHERE id_liquidacion=$1',[id]);
      await auditTableOperation(m,{userId:actor.userId},'liquidacion',id,'settlement.cancelled',{reason,accountId:ref.id_cuenta});
      return {resourceId:id,response:await this.settlement(id,undefined,m)};
    });
  }
}
