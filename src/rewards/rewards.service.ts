import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import type { ClientIdentity } from '../tables/client-access.guard.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { auditTableOperation } from '../tables/table-audit.js';
import { lockActiveVisit, lockTableOperations } from '../tables/table-operations.js';
import type { AdminRedemptionListDto, CreateRedemptionDto, RedemptionListDto, RewardCreateDto, RewardListDto, RewardUpdateDto } from './rewards.dto.js';

type Actor = { userId?: string; guestSessionId?: string; sessionId?: string };
const rewardFields = `r.id_recompensa AS id,r.nombre AS name,r.descripcion AS description,r.id_producto AS "productId",r.costo_puntos::float8 AS "pointsCost",r.activa AS active,r.orden AS "sortOrder",r.version AS version,r.creada_en AS "createdAt",r.actualizada_en AS "updatedAt",p.nombre AS "productName",p.precio_ctvs AS "productPriceCents",p.controla_inventario AS "tracksInventory"`;
const redemptionFields = `s.id_canje AS id,s.id_cliente AS "clientId",s.id_participante AS "participantId",s.id_cuenta AS "accountId",s.id_visita AS "visitId",s.id_jornada AS "operatingDayId",s.id_recompensa AS "rewardId",s.version_recompensa AS "rewardVersion",s.id_producto AS "productId",s.costo_puntos::float8 AS "pointsCost",s.estado AS status,s.expira_en AS "expiresAt",s.creada_en AS "createdAt",s.resuelta_en AS "resolvedAt",s.id_pedido AS "orderId",s.motivo AS reason`;

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);
  private expiryTimer?: ReturnType<typeof setInterval>;
  private expiryRunning = false;
  constructor(private readonly db: DataSource, private readonly idem: ParticipationIdempotencyService) {}

  onModuleInit() { void this.expirePending().catch(error=>this.logger.error('No se pudieron procesar los vencimientos de canjes.',error instanceof Error?error.stack:undefined)); this.expiryTimer = setInterval(() => void this.expirePending().catch(error=>this.logger.error('Falló el ciclo de vencimientos de canjes.',error instanceof Error?error.stack:undefined)), 60_000); this.expiryTimer.unref?.(); }
  onModuleDestroy() { if (this.expiryTimer) clearInterval(this.expiryTimer); }

  async staff(m: EntityManager, actor: AuthenticatedRequestContext, permission: string) {
    const [s] = await m.query(`SELECT u.activo,r.codigo role,s.revocada_en,s.expira_en>clock_timestamp() valid,EXISTS(SELECT 1 FROM rol_permiso rp JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE rp.id_rol=u.id_rol AND p.codigo=$3) allowed FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 FOR SHARE OF u,s`, [actor.userId, actor.sessionId, permission]);
    if (!s || !s.activo || s.revocada_en || !s.valid) throw new UnauthorizedException('Sesión inválida.');
    if (!s.allowed) throw new ForbiddenException('Permiso insuficiente.');
    return s.role as string;
  }
  private async client(m: EntityManager, actor: ClientIdentity) {
    if (!actor.userId) throw new UnauthorizedException('Se requiere una cuenta registrada.');
    const [s] = await m.query(`SELECT 1 FROM cliente c JOIN usuario u ON u.id_usuario=c.id_usuario JOIN rol r ON r.id_rol=u.id_rol JOIN sesion_usuario se ON se.id_usuario=u.id_usuario WHERE c.id_cliente=$1 AND u.id_usuario=$2 AND u.activo AND r.codigo='client' AND se.id_sesion_usuario=$3 AND se.revocada_en IS NULL AND se.expira_en>clock_timestamp() FOR SHARE OF u,se`, [actor.clientId, actor.userId, actor.userSessionId]);
    if (!s) throw new UnauthorizedException('Sesión inválida.');
  }
  private user(actor: Actor) { if (!actor.userId) throw new UnauthorizedException('Se requiere sesión de personal.'); return { userId: actor.userId }; }

  async createReward(dto: RewardCreateDto, actor: AuthenticatedRequestContext, key?: string) {
    return this.idem.run(this.user(actor), 'admin/rewards', key, dto, 201, 'recompensa', m => this.staff(m, actor, 'rewards.manage').then(()=>undefined), async m => {
      await lockTableOperations(m);
      const [product] = await m.query('SELECT id_producto FROM producto WHERE id_producto=$1 FOR SHARE', [dto.productId]);
      if (!product) throw new NotFoundException('Producto no encontrado.');
      const [row] = await m.query(`INSERT INTO recompensa(nombre,descripcion,id_producto,costo_puntos,activa,orden) VALUES($1,$2,$3,$4,$5,$6) RETURNING id_recompensa id`, [dto.name,dto.description ?? null,dto.productId,dto.pointsCost,dto.active,dto.sortOrder]);
      await auditTableOperation(m, this.user(actor), 'recompensa', row.id, 'reward.created', {name:dto.name,productId:dto.productId,pointsCost:dto.pointsCost,active:dto.active,sortOrder:dto.sortOrder});
      return {resourceId:row.id,response:await this.reward(row.id,true,m)};
    });
  }
  async updateReward(id: string, dto: RewardUpdateDto, actor: AuthenticatedRequestContext, key?: string) {
    const changes = Object.fromEntries(Object.entries(dto).filter(([k,v])=>k!=='expectedVersion' && v!==undefined));
    if (!Object.keys(changes).length) throw new BadRequestException('Envía al menos un campo modificable.');
    return this.idem.run(this.user(actor), `admin/rewards/${id.toLowerCase()}`, key, dto, 200, 'recompensa', m => this.staff(m,actor,'rewards.manage').then(()=>undefined), async m => {
      await lockTableOperations(m);
      const [old]=await m.query('SELECT * FROM recompensa WHERE id_recompensa=$1 FOR UPDATE',[id]);
      if (!old) throw new NotFoundException('Recompensa no encontrada.');
      if (old.version!==dto.expectedVersion) throw new ConflictException('La versión de la recompensa cambió.');
      const [updatedRows]=await m.query(`UPDATE recompensa SET nombre=COALESCE($2,nombre),descripcion=CASE WHEN $3 THEN $4 ELSE descripcion END,costo_puntos=COALESCE($5,costo_puntos),activa=COALESCE($6,activa),orden=COALESCE($7,orden),version=version+1,actualizada_en=clock_timestamp() WHERE id_recompensa=$1 RETURNING id_recompensa id`,[id,dto.name,dto.description!==undefined,dto.description ?? null,dto.pointsCost,dto.active,dto.sortOrder]);
      await auditTableOperation(m,this.user(actor),'recompensa',id,'reward.updated',{before:{name:old.nombre,description:old.descripcion,pointsCost:Number(old.costo_puntos),active:old.activa,sortOrder:old.orden,version:old.version},after:changes});
      return {resourceId:updatedRows[0].id,response:await this.reward(id,true,m)};
    });
  }
  private async reward(id:string, admin:boolean, m:EntityManager=this.db.manager) {
    const [r]=await m.query(`SELECT ${rewardFields},p.activo product_active,p.visible_menu product_visible,c.activa category_active FROM recompensa r JOIN producto p ON p.id_producto=r.id_producto LEFT JOIN categoria c ON c.id_categoria=p.id_categoria WHERE r.id_recompensa=$1`,[id]);
    if (!r || (!admin && (!r.active || !r.product_active || !r.product_visible || !r.category_active))) throw new NotFoundException('Recompensa no encontrada.');
    delete r.product_active;delete r.product_visible;delete r.category_active;return r;
  }
  async listRewards(q:RewardListDto,admin=false) {
    const args=[q.search ? `%${q.search}%`:null,q.active ?? null,q.productId ?? null,admin];
    const where=`($4 OR (r.activa AND p.activo AND p.visible_menu AND c.activa)) AND ($1::text IS NULL OR r.nombre ILIKE $1 OR p.nombre ILIKE $1) AND ($2::boolean IS NULL OR r.activa=$2) AND ($3::uuid IS NULL OR r.id_producto=$3)`;
    const from=`FROM recompensa r JOIN producto p ON p.id_producto=r.id_producto LEFT JOIN categoria c ON c.id_categoria=p.id_categoria`;
    const [{total}]=await this.db.query(`SELECT count(*)::int total ${from} WHERE ${where}`,args);
    const items=await this.db.query(`SELECT ${rewardFields} ${from} WHERE ${where} ORDER BY r.orden,r.nombre,r.id_recompensa LIMIT $5 OFFSET $6`,[...args,q.limit,(q.page-1)*q.limit]);
    return {items,total,page:q.page,limit:q.limit};
  }
  publicReward(id:string){return this.reward(id,false);}
  adminReward(id:string){return this.reward(id,true);}

  async request(visitId:string,dto:CreateRedemptionDto,client:ClientIdentity,key?:string) {
    const actor=this.user({userId:client.userId});
    return this.idem.run(actor,`visits/${visitId.toLowerCase()}/redemptions`,key,dto,201,'solicitud_canje',async m=>{await this.client(m,client);const [own]=await m.query('SELECT 1 FROM participante WHERE id_visita=$1 AND id_cliente=$2',[visitId,client.clientId]);if(!own)throw new NotFoundException('Participación no encontrada.');},async m=>{
      const zone=await lockTableOperations(m);await lockActiveVisit(m,visitId,zone);
      const [participant]=await m.query(`SELECT p.id_participante id,p.id_cliente client,p.estado status,c.id_cuenta account,c.id_jornada "dayId",c.estado account_status FROM participante p JOIN cuenta_consumo c ON c.id_participante=p.id_participante WHERE p.id_visita=$1 AND p.id_cliente=$2 FOR UPDATE OF p,c`,[visitId,client.clientId]);
      if(!participant)throw new NotFoundException('Participación no encontrada.');
      if(participant.status!=='approved'||participant.account_status!=='open')throw new ConflictException('Se requiere una participación aprobada y cuenta abierta.');
      const [cash] = await m.query('SELECT estado FROM caja WHERE id_jornada=$1', [participant.dayId]);
      if(cash?.estado==='closed')throw new ConflictException('La caja de la jornada ya fue cerrada.');
      const [bill]=await m.query(`SELECT 1 FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,[participant.account]);if(bill)throw new ConflictException('La cuenta tiene una liquidación pendiente.');
      const [reward]=await m.query(`SELECT r.*,p.controla_inventario tracks FROM recompensa r JOIN producto p ON p.id_producto=r.id_producto JOIN categoria c ON c.id_categoria=p.id_categoria WHERE r.id_recompensa=$1 AND r.activa AND p.activo AND p.visible_menu AND c.activa FOR SHARE OF r,p,c`,[dto.rewardId]);
      if(!reward)throw new NotFoundException('Recompensa no disponible.');if(reward.version!==dto.rewardVersion)throw new ConflictException('La versión de la recompensa cambió.');
      await m.query('SELECT 1 FROM cliente WHERE id_cliente=$1 FOR UPDATE',[client.clientId]);
      const [bal]=await m.query(`SELECT COALESCE(sum(puntos),0)::text balance FROM movimiento_puntos WHERE id_cliente=$1`,[client.clientId]);
      const [reserved]=await m.query(`SELECT COALESCE(sum(puntos),0)::text total FROM reserva_puntos_canje WHERE id_cliente=$1 AND estado='active'`,[client.clientId]);
      if(BigInt(bal.balance)-BigInt(reserved.total)<BigInt(reward.costo_puntos))throw new ConflictException('Puntos disponibles insuficientes.');
      let stock:any;
      if(reward.tracks){[stock]=await m.query(`SELECT id_inventario id,cantidad_fisica-cantidad_reservada available FROM inventario_diario WHERE id_jornada=$1 AND id_producto=$2 FOR UPDATE`,[participant.dayId,reward.id_producto]);if(!stock||stock.available<1)throw new ConflictException('Inventario insuficiente o sin inicializar.');}
      const [canje]=await m.query(`INSERT INTO solicitud_canje(id_cliente,id_participante,id_cuenta,id_visita,id_jornada,id_recompensa,version_recompensa,id_producto,controla_stock,costo_puntos,expira_en,creado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()+interval '15 minutes',$11) RETURNING id_canje id,expira_en "expiresAt"`,[client.clientId,participant.id,participant.account,visitId,participant.dayId,dto.rewardId,reward.version,reward.id_producto,reward.tracks,reward.costo_puntos,client.userId]);
      await m.query(`INSERT INTO reserva_puntos_canje(id_canje,id_cliente,puntos) VALUES($1,$2,$3)`,[canje.id,client.clientId,reward.costo_puntos]);
      if(reward.tracks){await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada+1 WHERE id_inventario=$1',[stock.id]);await m.query(`INSERT INTO reserva_inventario_canje(id_canje,id_inventario) VALUES($1,$2)`,[canje.id,stock.id]);}
      await this.history(m,canje.id,client.userId,'redemption.requested',{rewardId:dto.rewardId,points:Number(reward.costo_puntos),tracksInventory:reward.tracks});
      await auditTableOperation(m,actor,'solicitud_canje',canje.id,'redemption.requested',{clientId:client.clientId,rewardId:dto.rewardId,points:Number(reward.costo_puntos)});
      return {resourceId:canje.id,response:await this.redemption(canje.id,client.clientId,m)};
    });
  }
  private async history(m:EntityManager,id:string,user:string|undefined,event:string,detail:object={}){await m.query(`INSERT INTO historial_canje(id_canje,actor_usuario,evento,detalle) VALUES($1,$2,$3,$4::jsonb)`,[id,user??null,event,JSON.stringify(detail)]);}
  async redemption(id:string,clientId?:string,m:EntityManager=this.db.manager,includeHistory=false){
    const [r]=await m.query(`SELECT ${redemptionFields},r.nombre "rewardName",p.nombre "productName" FROM solicitud_canje s JOIN recompensa r ON r.id_recompensa=s.id_recompensa JOIN producto p ON p.id_producto=s.id_producto WHERE s.id_canje=$1 AND ($2::uuid IS NULL OR s.id_cliente=$2)`,[id,clientId??null]);
    if(!r)throw new NotFoundException('Canje no encontrado.');if(includeHistory)r.history=await m.query(`SELECT evento event,actor_usuario "actorUserId",detalle AS detail,ocurrido_en "occurredAt" FROM historial_canje WHERE id_canje=$1 ORDER BY ocurrido_en,id_historial`,[id]);return r;
  }
  async listRedemptions(q:RedemptionListDto|AdminRedemptionListDto,clientId?:string){
    const a=q as AdminRedemptionListDto;const args=[clientId??null,q.status??null,q.visitId??null,a.clientId??null,a.operatingDayId??null];const where=`($1::uuid IS NULL OR s.id_cliente=$1) AND ($2::text IS NULL OR s.estado=$2) AND ($3::uuid IS NULL OR s.id_visita=$3) AND ($4::uuid IS NULL OR s.id_cliente=$4) AND ($5::uuid IS NULL OR s.id_jornada=$5)`;const from=`FROM solicitud_canje s`;
    const [{total}]=await this.db.query(`SELECT count(*)::int total ${from} WHERE ${where}`,args);const rows=await this.db.query(`SELECT s.id_canje id ${from} WHERE ${where} ORDER BY s.creada_en DESC,s.id_canje DESC LIMIT $6 OFFSET $7`,[...args,q.limit,(q.page-1)*q.limit]);const items=await Promise.all(rows.map((x:{id:string})=>this.redemption(x.id,clientId)));return{items,total,page:q.page,limit:q.limit};
  }
  async cancel(id:string,client:ClientIdentity,key?:string){
    const actor=this.user({userId:client.userId});return this.idem.run(actor,`me/redemptions/${id.toLowerCase()}/cancel`,key,{},200,'solicitud_canje',async m=>{await this.client(m,client);const [own]=await m.query('SELECT 1 FROM solicitud_canje WHERE id_canje=$1 AND id_cliente=$2',[id,client.clientId]);if(!own)throw new NotFoundException('Canje no encontrado.');},async m=>{await lockTableOperations(m);await m.query('SELECT 1 FROM cliente WHERE id_cliente=$1 FOR UPDATE',[client.clientId]);const [s]=await m.query('SELECT * FROM solicitud_canje WHERE id_canje=$1 AND id_cliente=$2 FOR UPDATE',[id,client.clientId]);if(!s)throw new NotFoundException('Canje no encontrado.');if(s.estado!=='pending')throw new ConflictException('El canje ya fue resuelto.');await this.release(m,id,'cancelled');await m.query('UPDATE solicitud_canje SET resuelto_por=$2 WHERE id_canje=$1',[id,client.userId]);await this.history(m,id,client.userId,'redemption.cancelled');await auditTableOperation(m,actor,'solicitud_canje',id,'redemption.cancelled',{});return{resourceId:id,response:await this.redemption(id,client.clientId,m)};});
  }
  async decide(id:string,action:'approve'|'reject',actor:AuthenticatedRequestContext,key:string|undefined,reason?:string){
    return this.idem.run(this.user(actor),`admin/redemptions/${id.toLowerCase()}/${action}`,key,{reason:reason??null},200,'solicitud_canje',m=>this.staff(m,actor,'redemptions.manage').then(()=>undefined),async m=>{
      const zone=await lockTableOperations(m);const [ref]=await m.query('SELECT id_visita visit,id_cliente client,id_cuenta account FROM solicitud_canje WHERE id_canje=$1',[id]);if(!ref)throw new NotFoundException('Canje no encontrado.');
      if(action==='approve')await lockActiveVisit(m,ref.visit,zone);else await m.query('SELECT 1 FROM visita_mesa WHERE id_visita=$1 FOR UPDATE',[ref.visit]);
      if(action==='approve'){const [closed]=await m.query(`SELECT 1 FROM solicitud_canje s JOIN caja c ON c.id_jornada=s.id_jornada WHERE s.id_canje=$1 AND c.estado='closed'`,[id]);if(closed)throw new ConflictException('La caja de la jornada ya fue cerrada.');}
      await m.query('SELECT 1 FROM cliente WHERE id_cliente=$1 FOR UPDATE',[ref.client]);await m.query('SELECT 1 FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',[ref.account]);
      const [s]=await m.query('SELECT * FROM solicitud_canje WHERE id_canje=$1 FOR UPDATE',[id]);if(s.estado!=='pending')throw new ConflictException('El canje ya fue resuelto.');
      if(action==='reject'){await this.release(m,id,'rejected');await m.query('UPDATE solicitud_canje SET motivo=$2,resuelto_por=$3 WHERE id_canje=$1',[id,reason,actor.userId]);await this.history(m,id,actor.userId,'redemption.rejected',{reason});await auditTableOperation(m,this.user(actor),'solicitud_canje',id,'redemption.rejected',{reason});return{resourceId:id,response:await this.redemption(id,undefined,m,true)};}
      const [valid]=await m.query(`SELECT s.expira_en>clock_timestamp() fresh,p.estado participant,c.estado account,v.estado visit,t.activa table_active,j.estado day_status,cfg.zona_horaria zone,j.fecha_operativa=timezone(cfg.zona_horaria,clock_timestamp())::date current_day,r.activa reward,pd.activo product_active,pd.visible_menu,cg.activa category_active,s.controla_stock tracks FROM solicitud_canje s JOIN participante p ON p.id_participante=s.id_participante JOIN cuenta_consumo c ON c.id_cuenta=s.id_cuenta JOIN visita_mesa v ON v.id_visita=s.id_visita JOIN mesa t ON t.id_mesa=v.id_mesa JOIN jornada_operativa j ON j.id_jornada=s.id_jornada JOIN configuracion_operativa cfg ON cfg.id_configuracion=1 JOIN recompensa r ON r.id_recompensa=s.id_recompensa JOIN producto pd ON pd.id_producto=s.id_producto JOIN categoria cg ON cg.id_categoria=pd.id_categoria WHERE s.id_canje=$1`,[id]);
      if(!valid.fresh||valid.participant!=='approved'||valid.account!=='open'||valid.visit!=='open'||!valid.table_active||valid.day_status!=='open'||!valid.current_day||!valid.reward||!valid.product_active||!valid.visible_menu||!valid.category_active)throw new ConflictException('El canje o las condiciones operativas ya no están vigentes.');
      const [bill]=await m.query(`SELECT 1 FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,[s.id_cuenta]);if(bill)throw new ConflictException('La cuenta tiene una liquidación pendiente.');
      const [balance]=await m.query(`SELECT COALESCE((SELECT sum(puntos) FROM movimiento_puntos WHERE id_cliente=$1),0)::text balance,COALESCE((SELECT sum(puntos) FROM reserva_puntos_canje WHERE id_cliente=$1 AND estado='active' AND id_canje<>$2),0)::text reserved`,[s.id_cliente,id]);if(BigInt(balance.balance)-BigInt(balance.reserved)<BigInt(s.costo_puntos))throw new ConflictException('El saldo disponible ya no cubre este canje.');
      const [inv]=await m.query(`SELECT ric.id_reserva reservation,ric.id_inventario inventory,ric.estado reservation_state,i.cantidad_fisica physical,i.cantidad_reservada reserved FROM reserva_inventario_canje ric JOIN inventario_diario i ON i.id_inventario=ric.id_inventario WHERE ric.id_canje=$1 FOR UPDATE OF ric,i`,[id]);if(valid.tracks&&(!inv||inv.reservation_state!=='active'))throw new ConflictException('La reserva de existencias ya no está disponible.');
      const [order]=await m.query(`INSERT INTO pedido(id_jornada,id_visita,id_cuenta,actor_usuario,modalidad,origen,estado,id_canje) VALUES($1,$2,$3,$4,'local','reward','submitted',$5) RETURNING id_pedido id`,[s.id_jornada,s.id_visita,s.id_cuenta,actor.userId,id]);
      const [version]=await m.query(`INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs) VALUES($1,1,'current',0) RETURNING id_version id`,[order.id]);
      const [detail]=await m.query(`INSERT INTO detalle_pedido(id_version,id_producto,cantidad,precio_unitario_ctvs,controla_stock_snapshot) VALUES($1,$2,1,0,$3) RETURNING id_detalle id`,[version.id,s.id_producto,valid.tracks]);
      await m.query(`INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES($1,$2,1)`,[detail.id,s.id_cuenta]);
      if(valid.tracks){await m.query(`INSERT INTO reserva_inventario(id_detalle,id_inventario,cantidad) VALUES($1,$2,1)`,[detail.id,inv.inventory]);await m.query(`UPDATE reserva_inventario_canje SET estado='transferred',resuelta_en=clock_timestamp() WHERE id_canje=$1`,[id]);}
      await m.query(`INSERT INTO movimiento_puntos(id_cliente,id_canje,tipo,puntos) VALUES($1,$2,'redeem',-$3::bigint)`,[s.id_cliente,id,s.costo_puntos]);await this.ensurePointBalance(s.id_cliente,m);await m.query(`UPDATE reserva_puntos_canje SET estado='consumed',resuelta_en=clock_timestamp() WHERE id_canje=$1 AND estado='active'`,[id]);
      await m.query(`INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_tipo,evento,estado_nuevo) VALUES($1,$2,$3,'usuario','order.reward_submitted','submitted')`,[order.id,version.id,actor.userId]);
      await m.query(`UPDATE solicitud_canje SET estado='approved',id_pedido=$2,resuelto_por=$3,resuelta_en=clock_timestamp() WHERE id_canje=$1`,[id,order.id,actor.userId]);await this.history(m,id,actor.userId,'redemption.approved',{orderId:order.id});await auditTableOperation(m,this.user(actor),'solicitud_canje',id,'redemption.approved',{orderId:order.id,points:Number(s.costo_puntos)});
      return{resourceId:id,response:await this.redemption(id,undefined,m,true)};
    });
  }
  private async release(m:EntityManager,id:string,status:'rejected'|'cancelled'|'expired'){
    const [inv]=await m.query(`SELECT id_inventario inventory FROM reserva_inventario_canje WHERE id_canje=$1 AND estado='active' FOR UPDATE`,[id]);if(inv){await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-1 WHERE id_inventario=$1',[inv.inventory]);await m.query(`UPDATE reserva_inventario_canje SET estado='released',resuelta_en=clock_timestamp() WHERE id_canje=$1`,[id]);}
    await m.query(`UPDATE reserva_puntos_canje SET estado='released',resuelta_en=clock_timestamp() WHERE id_canje=$1 AND estado='active'`,[id]);await m.query(`UPDATE solicitud_canje SET estado=$2,resuelto_por=NULL,resuelta_en=clock_timestamp() WHERE id_canje=$1`,[id,status]);
  }
  async releaseForParticipant(m:EntityManager,participantId:string){const rows=await m.query(`SELECT id_canje id FROM solicitud_canje WHERE id_participante=$1 AND estado='pending' ORDER BY id_canje FOR UPDATE`,[participantId]);for(const r of rows){await this.release(m,r.id,'cancelled');await this.history(m,r.id,undefined,'redemption.participant_left');await auditTableOperation(m,{},'solicitud_canje',r.id,'redemption.participant_left',{});}}
  async releaseForVisit(m:EntityManager,visitId:string){const rows=await m.query(`SELECT id_canje id FROM solicitud_canje WHERE id_visita=$1 AND estado='pending' ORDER BY id_cliente,id_canje FOR UPDATE`,[visitId]);for(const r of rows){await this.release(m,r.id,'cancelled');await this.history(m,r.id,undefined,'redemption.visit_closed');await auditTableOperation(m,{},'solicitud_canje',r.id,'redemption.visit_closed',{});}}
  async releaseForOperatingDay(m:EntityManager,dayId:string){const rows=await m.query(`SELECT id_canje id FROM solicitud_canje WHERE id_jornada=$1 AND estado='pending' ORDER BY id_cliente,id_canje FOR UPDATE`,[dayId]);for(const r of rows){await this.release(m,r.id,'cancelled');await this.history(m,r.id,undefined,'redemption.cash_closed');await auditTableOperation(m,{},'solicitud_canje',r.id,'redemption.cash_closed',{operatingDayId:dayId});}}
  async refundForOrder(m:EntityManager,orderId:string,actor:Actor){const [r]=await m.query(`SELECT id_canje id,id_cliente client,costo_puntos points,estado FROM solicitud_canje WHERE id_pedido=$1 FOR UPDATE`,[orderId]);if(!r||r.estado!=='approved')return;await m.query('SELECT 1 FROM cliente WHERE id_cliente=$1 FOR UPDATE',[r.client]);const [inserted]=await m.query(`INSERT INTO movimiento_puntos(id_cliente,id_canje,tipo,puntos) VALUES($1,$2,'redemptionReturn',$3) ON CONFLICT(id_canje,tipo) WHERE id_canje IS NOT NULL DO NOTHING RETURNING id_movimiento`,[r.client,r.id,r.points]);if(inserted){await this.history(m,r.id,actor.userId,'redemption.points_returned',{orderId,points:Number(r.points)});await auditTableOperation(m,actor,'solicitud_canje',r.id,'redemption.points_returned',{orderId,points:Number(r.points)});await this.ensurePointBalance(r.client,m);}}
  private async ensurePointBalance(clientId:string,m:EntityManager){const [r]=await m.query('SELECT COALESCE(sum(puntos),0)::text balance FROM movimiento_puntos WHERE id_cliente=$1',[clientId]);if(!Number.isSafeInteger(Number(r.balance)))throw new ConflictException('Saldo de puntos excede el rango seguro.');}
  async expirePending(){if(this.expiryRunning||!this.db.isInitialized)return;this.expiryRunning=true;try{const attempted:string[]=[];while(true){const ids:Array<{id:string}>=await this.db.query(`SELECT id_canje id FROM solicitud_canje WHERE estado='pending' AND expira_en<=clock_timestamp() AND NOT(id_canje=ANY($1::uuid[])) ORDER BY expira_en,id_canje LIMIT 100`,[attempted]);if(!ids.length)break;for(const row of ids){attempted.push(row.id);try{await this.db.transaction(async m=>{await lockTableOperations(m);const [s]=await m.query(`SELECT id_canje FROM solicitud_canje WHERE id_canje=$1 AND estado='pending' AND expira_en<=clock_timestamp() FOR UPDATE`,[row.id]);if(!s)return;await this.release(m,row.id,'expired');await this.history(m,row.id,undefined,'redemption.expired');await auditTableOperation(m,{},'solicitud_canje',row.id,'redemption.expired',{});});}catch(error){this.logger.error(`No se pudo vencer un canje pendiente.`,error instanceof Error?error.stack:undefined);}}}}finally{this.expiryRunning=false;}}
}
