import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import type { ClientIdentity } from './client-access.guard.js';
import type { AdminOrderQueryDto, CreateOrderDto, EditOrderDto, OrderQueryDto, OrderTransitionDto, CancelOrderDto } from './orders.dto.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { ParticipantsService } from './participants.service.js';
import { auditTableOperation } from './table-audit.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

@Injectable()
export class OrdersService {
  constructor(private readonly db: DataSource, private readonly idempotency: ParticipationIdempotencyService, private readonly participants: ParticipantsService, private readonly config:ConfigService) {}

  async edit(id: string, dto: EditOrderDto, client: ClientIdentity, key?: string) {
    const ids = dto.items.map(item => item.productId.toLowerCase());
    if (new Set(ids).size !== ids.length) throw new BadRequestException('No se admiten productos repetidos.');
    const actor = client.guestSessionId ? {guestSessionId:client.guestSessionId} : {userId:client.userId};
    return this.idempotency.run(actor,`orders/${id.toLowerCase()}/edit`,key,dto,200,'pedido',async m => {
      await this.participants.authenticate(m,client); await this.detail(id,client.clientId,false,m);
    },async m => {
      const zone = await lockTableOperations(m);
      const [ref] = await m.query('SELECT id_visita FROM pedido WHERE id_pedido=$1',[id]);
      if (!ref) throw new NotFoundException('Pedido no encontrado.');
      if (!ref.id_visita) throw new ConflictException('Los domicilios no admiten edición.');
      await lockActiveVisit(m,ref.id_visita,zone);
      const [order] = await m.query(`SELECT o.estado,o.id_cuenta,o.id_jornada,v.id_version,v.numero,(o.editable_hasta>clock_timestamp()) AS editable FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta JOIN participante p ON p.id_participante=c.id_participante WHERE o.id_pedido=$1 AND c.id_cliente=$2 AND c.estado='open' AND p.estado='approved' FOR UPDATE OF o,v,c,p`,[id,client.clientId]);
      if (!order || order.estado !== 'submitted' || order.numero !== dto.expectedVersion || !order.editable) throw new ConflictException('El pedido no se puede editar o su versión cambió.');
      const [pending] = await m.query(`SELECT 1 FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,[order.id_cuenta]);
      if (pending) throw new ConflictException('La cuenta tiene una liquidación pendiente.');
      const products: Array<{id:string;price:number;tracks:boolean}> = await m.query(`SELECT p.id_producto AS id,p.precio_ctvs AS price,p.controla_inventario AS tracks FROM producto p JOIN categoria c ON c.id_categoria=p.id_categoria WHERE p.id_producto=ANY($1::uuid[]) AND p.activo AND p.visible_menu AND c.activa ORDER BY p.id_producto FOR SHARE OF p,c`,[ids]);
      if (products.length !== ids.length) throw new ConflictException('Uno o más productos no están disponibles.');
      const old: Array<{id:string;price:number;tracks:boolean}> = await m.query('SELECT id_producto AS id,precio_unitario_ctvs AS price,controla_stock_snapshot AS tracks FROM detalle_pedido WHERE id_version=$1',[order.id_version]);
      const reservations: Array<{id:string;inventory:string;quantity:number}> = await m.query(`SELECT r.id_reserva AS id,r.id_inventario AS inventory,r.cantidad AS quantity FROM reserva_inventario r JOIN detalle_pedido d ON d.id_detalle=r.id_detalle WHERE d.id_version=$1 AND r.estado='active' ORDER BY r.id_inventario FOR UPDATE OF r`,[order.id_version]);
      const stock: Array<{id:string;product:string;available:number}> = await m.query(`SELECT id_inventario AS id,id_producto AS product,cantidad_fisica-cantidad_reservada AS available FROM inventario_diario WHERE id_jornada=$1 AND (id_producto=ANY($2::uuid[]) OR id_inventario=ANY($3::uuid[])) ORDER BY id_producto FOR UPDATE`,[order.id_jornada,ids,reservations.map(r=>r.inventory)]);
      let total=0;
      for (const item of dto.items) {
        const product=products.find(p=>p.id===item.productId.toLowerCase())!; const snapshot=old.find(p=>p.id===product.id) ?? product;
        const inventory=stock.find(s=>s.product===product.id); const released=reservations.filter(r=>r.inventory===inventory?.id).reduce((a,r)=>a+r.quantity,0);
        if (snapshot.tracks && (!inventory || inventory.available+released<item.quantity)) throw new ConflictException('Inventario insuficiente o sin inicializar.');
        total+=snapshot.price*item.quantity;
      }
      if (!Number.isSafeInteger(total)) throw new ConflictException('El total supera el límite permitido.');
      for (const r of reservations) { await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-$2 WHERE id_inventario=$1',[r.inventory,r.quantity]); await m.query(`UPDATE reserva_inventario SET estado='released',resuelta_en=clock_timestamp() WHERE id_reserva=$1`,[r.id]); }
      await m.query(`UPDATE asignacion_consumo SET estado='superseded' WHERE id_detalle IN (SELECT id_detalle FROM detalle_pedido WHERE id_version=$1) AND estado='active'`,[order.id_version]);
      await m.query(`UPDATE version_pedido SET estado='superseded' WHERE id_version=$1`,[order.id_version]);
      const [version]=await m.query(`INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs,observaciones) VALUES ($1,$2,'current',$3,$4) RETURNING id_version AS id`,[id,order.numero+1,total,dto.notes ?? null]);
      for (const item of dto.items) {
        const product=products.find(p=>p.id===item.productId.toLowerCase())!; const snapshot=old.find(p=>p.id===product.id) ?? product;
        const [detail]=await m.query(`INSERT INTO detalle_pedido(id_version,id_producto,cantidad,precio_unitario_ctvs,controla_stock_snapshot,observaciones) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_detalle AS id`,[version.id,product.id,item.quantity,snapshot.price,snapshot.tracks,item.notes ?? null]);
        await m.query('INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES ($1,$2,$3)',[detail.id,order.id_cuenta,item.quantity]);
        if (snapshot.tracks) { const i=stock.find(s=>s.product===product.id)!; await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada+$2 WHERE id_inventario=$1',[i.id,item.quantity]); await m.query('INSERT INTO reserva_inventario(id_detalle,id_inventario,cantidad) VALUES ($1,$2,$3)',[detail.id,i.id,item.quantity]); }
      }
      await m.query(`INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_sesion_cliente,actor_tipo,evento,estado_anterior,estado_nuevo) VALUES ($1,$2,$3,$4,$5,'order.edited','submitted','submitted')`,[id,version.id,actor.userId ?? null,actor.guestSessionId ?? null,actor.guestSessionId ? 'sesion_cliente':'usuario']);
      await auditTableOperation(m,actor,'pedido',id,'order.edited',{previousVersion:order.numero,version:order.numero+1,totalCents:total});
      return {resourceId:id,response:await this.detail(id,client.clientId,false,m)};
    });
  }

  async transition(id: string, action: 'cancel' | 'start-preparation' | 'ready' | 'dispatch' | 'deliver', dto: OrderTransitionDto | CancelOrderDto, actor: { userId?: string; guestSessionId?: string; sessionId?:string }, client?: ClientIdentity, key?: string) {
    return this.idempotency.run(actor, `orders/${id.toLowerCase()}/${action}`, key, dto, 200, 'pedido', async m => {
      if (client) { await this.participants.authenticate(m, client); await this.detail(id, client.clientId, false, m); }
      else {
        const [valid]=await m.query(`SELECT 1 FROM usuario u JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 AND u.activo AND s.revocada_en IS NULL AND s.expira_en>clock_timestamp() FOR SHARE OF u,s`,[actor.userId,actor.sessionId]);
        if (!valid) throw new UnauthorizedException('Sesion no valida.');
        const [allowed]=await m.query(`SELECT 1 FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=$1 AND p.codigo='orders.manage'`,[actor.userId]);
        if (!allowed) throw new ForbiddenException('Falta permiso orders.manage.');
      }
    }, async m => {
      const zone = await lockTableOperations(m);
      const [ref] = await m.query('SELECT id_visita FROM pedido WHERE id_pedido=$1', [id]);
      if (!ref) throw new NotFoundException('Pedido no encontrado.');
      if (action === 'start-preparation' && ref.id_visita) await lockActiveVisit(m, ref.id_visita, zone);
      const [order] = await m.query(`SELECT o.estado,o.modalidad,o.id_jornada,o.id_cuenta,v.id_version,v.numero FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 FOR UPDATE OF o,v`, [id]);
      if (order.modalidad==='delivery') {
        if (client) throw new ConflictException('Operación no habilitada para domicilios.');
        const [account]=await m.query('SELECT estado FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',[order.id_cuenta]);
        if(account.estado!=='open') throw new ConflictException('La cuenta debe estar abierta.');
        if (action==='start-preparation' || action==='dispatch') {
          const [day]=await m.query(`SELECT 1 FROM jornada_operativa WHERE id_jornada=$1 AND estado='open' AND fecha_operativa=timezone($2,clock_timestamp())::date FOR UPDATE`,[order.id_jornada,zone]);
          const [paid]=await m.query(`SELECT 1 FROM liquidacion l JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE l.id_cuenta=$1 AND l.estado='settled' AND p.metodo='transfer' AND p.estado='confirmed'`,[order.id_cuenta]);
          if ((action==='start-preparation' && !day) || !paid) throw new ConflictException('Se requiere jornada actual abierta y transferencia confirmada.');
        }
        if (action==='cancel') {
          const [payment]=await m.query(`SELECT 1 FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado IN ('confirmed','pendingVerification')`,[order.id_cuenta]);
          if (payment) throw new ConflictException('Existe un pago confirmado o pendiente.');
          await m.query(`UPDATE liquidacion SET estado='cancelled',anulada_por=$2,anulada_en=clock_timestamp(),motivo_anulacion=$3 WHERE id_cuenta=$1 AND estado='pending'`,[order.id_cuenta,actor.userId,'reason' in dto?dto.reason:null]);
          await m.query(`UPDATE detalle_liquidacion SET vigente=false WHERE id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=$1)`,[order.id_cuenta]);
          await m.query(`UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,[order.id_cuenta]);
        }
      }
      if (action==='dispatch' && order.modalidad!=='delivery') throw new ConflictException('Solo domicilios admiten despacho.');
      const expected: Record<string, string> = { cancel:'submitted', 'start-preparation':'submitted', ready:'preparing', dispatch:'ready', deliver:order.modalidad==='delivery'?'dispatched':'ready' };
      if (order.numero !== dto.expectedVersion || order.estado !== expected[action]) throw new ConflictException('Estado o versión del pedido no válidos.');
      const target: Record<string, string> = { cancel:'cancelled', 'start-preparation':'preparing', ready:'ready', dispatch:'dispatched', deliver:'delivered' };
      if (action === 'cancel' || action === 'start-preparation') {
        const reservations: Array<{ id: string; inventory: string; quantity: number; physical: number }> = await m.query(`SELECT r.id_reserva AS id,r.id_inventario AS inventory,r.cantidad AS quantity,i.cantidad_fisica AS physical FROM reserva_inventario r JOIN detalle_pedido d ON d.id_detalle=r.id_detalle JOIN inventario_diario i ON i.id_inventario=r.id_inventario WHERE d.id_version=$1 AND r.estado='active' ORDER BY i.id_producto FOR UPDATE OF i,r`, [order.id_version]);
        for (const reservation of reservations) {
          if (action === 'cancel') await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-$2 WHERE id_inventario=$1', [reservation.inventory,reservation.quantity]);
          else {
            await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-$2,cantidad_fisica=cantidad_fisica-$2 WHERE id_inventario=$1', [reservation.inventory,reservation.quantity]);
            await m.query(`INSERT INTO movimiento_inventario(id_inventario,id_reserva,registrado_por,tipo,delta_fisico,cantidad_anterior,cantidad_posterior,motivo) VALUES ($1,$2,$3,'orderConsumption',$4,$5,$6,'Preparación de pedido')`, [reservation.inventory,reservation.id,actor.userId,-reservation.quantity,reservation.physical,reservation.physical-reservation.quantity]);
          }
          await m.query('UPDATE reserva_inventario SET estado=$2,resuelta_en=clock_timestamp() WHERE id_reserva=$1', [reservation.id, action === 'cancel' ? 'released' : 'consumed']);
        }
        if (action === 'cancel') await m.query(`UPDATE asignacion_consumo SET estado='superseded' WHERE id_detalle IN (SELECT id_detalle FROM detalle_pedido WHERE id_version=$1) AND estado='active'`, [order.id_version]);
      }
      await m.query('UPDATE pedido SET estado=$2 WHERE id_pedido=$1', [id,target[action]]);
      if (order.modalidad==='delivery' && (action==='dispatch' || action==='deliver')) {
        const field=action==='dispatch'?'despachado':'entregado';
        await m.query(`UPDATE entrega_domicilio SET ${field}_en=clock_timestamp(),${field}_por=$2 WHERE id_pedido=$1`,[id,actor.userId]);
        if(action==='deliver') await m.query(`UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,[order.id_cuenta]);
      }
      const reason = 'reason' in dto ? dto.reason : null;
      await m.query(`INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_sesion_cliente,actor_tipo,evento,estado_anterior,estado_nuevo,motivo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id,order.id_version,actor.userId ?? null,actor.guestSessionId ?? null,actor.guestSessionId ? 'sesion_cliente':'usuario',`order.${action}`,order.estado,target[action],reason]);
      await auditTableOperation(m,actor,'pedido',id,`order.${action}`,{ before:order.estado,after:target[action],reason });
      return {resourceId:id,response:await this.detail(id,client?.clientId,false,m)};
    });
  }

  async create(visitId: string, dto: CreateOrderDto, client: ClientIdentity, key?: string) {
    const ids = dto.items.map(item => item.productId.toLowerCase());
    if (new Set(ids).size !== ids.length) throw new BadRequestException('No se admiten productos repetidos.');
    const actor = client.guestSessionId ? { guestSessionId: client.guestSessionId } : { userId: client.userId };
    return this.idempotency.run(actor, `visits/${visitId.toLowerCase()}/orders`, key, dto, 201, 'pedido', async m => {
      await this.participants.authenticate(m, client);
      const [own] = await m.query('SELECT 1 FROM participante WHERE id_visita=$1 AND id_cliente=$2', [visitId, client.clientId]);
      if (!own) throw new NotFoundException('Participación no encontrada.');
    }, async m => {
      const zone = await lockTableOperations(m);
      await lockActiveVisit(m, visitId, zone);
      const [account] = await m.query(`SELECT c.id_cuenta AS id,c.id_jornada AS day FROM participante p JOIN cuenta_consumo c ON c.id_participante=p.id_participante WHERE p.id_visita=$1 AND p.id_cliente=$2 AND p.estado='approved' AND c.estado='open' FOR UPDATE OF p,c`, [visitId, client.clientId]);
      if (!account) throw new ConflictException('Se requiere una participación aprobada y cuenta abierta.');
      const [pending] = await m.query(`SELECT 1 FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,[account.id]);
      if (pending) throw new ConflictException('La cuenta tiene una liquidación pendiente.');
      const products: Array<{ id: string; price: number; tracks: boolean }> = await m.query(`SELECT p.id_producto AS id,p.precio_ctvs AS price,p.controla_inventario AS tracks FROM producto p JOIN categoria c ON c.id_categoria=p.id_categoria WHERE p.id_producto=ANY($1::uuid[]) AND p.activo AND p.visible_menu AND c.activa ORDER BY p.id_producto FOR SHARE OF p,c`, [ids]);
      if (products.length !== ids.length) throw new ConflictException('Uno o más productos no están disponibles.');
      const inventory: Array<{ id: string; product: string; available: number }> = await m.query(`SELECT id_inventario AS id,id_producto AS product,cantidad_fisica-cantidad_reservada AS available FROM inventario_diario WHERE id_jornada=$1 AND id_producto=ANY($2::uuid[]) ORDER BY id_producto FOR UPDATE`, [account.day, ids]);
      let total = 0;
      for (const item of dto.items) {
        const product = products.find(p => p.id === item.productId.toLowerCase())!;
        const stock = inventory.find(i => i.product === product.id);
        if (product.tracks && (!stock || stock.available < item.quantity)) throw new ConflictException('Inventario insuficiente o sin inicializar.');
        total += product.price * item.quantity;
      }
      if (!Number.isSafeInteger(total)) throw new ConflictException('El total supera el límite permitido.');
      const [order] = await m.query(`INSERT INTO pedido(id_jornada,id_visita,id_cuenta,actor_usuario,actor_sesion_cliente,editable_hasta) SELECT $1,$2,$3,$4,$5,clock_timestamp()+make_interval(secs => edicion_local_seg) FROM configuracion_operativa WHERE id_configuracion=1 RETURNING id_pedido AS id`, [account.day, visitId, account.id, actor.userId ?? null, actor.guestSessionId ?? null]);
      const [version] = await m.query(`INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs,observaciones) VALUES ($1,1,'current',$2,$3) RETURNING id_version AS id`, [order.id, total, dto.notes ?? null]);
      for (const item of dto.items) {
        const product = products.find(p => p.id === item.productId.toLowerCase())!;
        const [detail] = await m.query(`INSERT INTO detalle_pedido(id_version,id_producto,cantidad,precio_unitario_ctvs,controla_stock_snapshot,observaciones) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_detalle AS id`, [version.id, product.id, item.quantity, product.price, product.tracks, item.notes ?? null]);
        await m.query(`INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES ($1,$2,$3)`, [detail.id, account.id, item.quantity]);
        if (product.tracks) {
          const stock = inventory.find(i => i.product === product.id)!;
          await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada+$2 WHERE id_inventario=$1', [stock.id, item.quantity]);
          await m.query('INSERT INTO reserva_inventario(id_detalle,id_inventario,cantidad) VALUES ($1,$2,$3)', [detail.id, stock.id, item.quantity]);
        }
      }
      await m.query(`INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_sesion_cliente,actor_tipo,evento,estado_nuevo) VALUES ($1,$2,$3,$4,$5,'order.submitted','submitted')`, [order.id, version.id, actor.userId ?? null, actor.guestSessionId ?? null, actor.guestSessionId ? 'sesion_cliente' : 'usuario']);
      await auditTableOperation(m, actor, 'pedido', order.id, 'order.submitted', { visitId, accountId: account.id, totalCents: total });
      return { resourceId: order.id, response: await this.detail(order.id, client.clientId, false, m) };
    });
  }

  async createDelivery(requestId: string, dto: CreateOrderDto, client: ClientIdentity, key?: string) {
    const ids = dto.items.map(item => item.productId.toLowerCase());
    if (new Set(ids).size !== ids.length) throw new BadRequestException('No se admiten productos repetidos.');
    const actor = client.guestSessionId ? { guestSessionId: client.guestSessionId } : { userId: client.userId };
    return this.idempotency.run(actor, `delivery-requests/${requestId.toLowerCase()}/orders`, key, dto, 201, 'pedido', async m => {
      await this.participants.authenticate(m, client);
      const [own]=await m.query('SELECT 1 FROM solicitud_domicilio WHERE id_solicitud=$1 AND id_cliente=$2',[requestId,client.clientId]);
      if (!own) throw new NotFoundException('Solicitud no encontrada.');
    }, async m => {
      if (!this.config.get<boolean>('TRANSFER_PAYMENTS_ENABLED',false)) throw new ServiceUnavailableException('Las transferencias están deshabilitadas.');
      const zone=await lockTableOperations(m);
      const [day]=await m.query(`SELECT j.id_jornada AS id,c.id_caja AS cash FROM jornada_operativa j JOIN caja c ON c.id_jornada=j.id_jornada WHERE j.estado='open' AND c.estado='open' AND j.fecha_operativa=timezone($1,clock_timestamp())::date FOR UPDATE OF j,c`,[zone]);
      if (!day) throw new ConflictException('Se requiere jornada y caja actuales abiertas.');
      const [request]=await m.query(`SELECT s.*,cfg.version FROM solicitud_domicilio s JOIN config_domicilio cfg ON cfg.id_configuracion=s.id_configuracion WHERE s.id_solicitud=$1 FOR UPDATE OF s`,[requestId]);
      const [settings]=await m.query('SELECT * FROM config_domicilio ORDER BY version DESC LIMIT 1');
      const [used]=await m.query('SELECT 1 FROM entrega_domicilio WHERE id_solicitud=$1',[requestId]);
      if (used || request.estado!=='approved' || request.id_jornada!==day.id || !settings.habilitado || settings.version!==request.version) throw new ConflictException('La solicitud no está disponible para un pedido.');
      const [account]=await m.query(`INSERT INTO cuenta_consumo(id_cliente,id_jornada,modalidad) VALUES ($1,$2,'delivery') RETURNING id_cuenta AS id,id_jornada AS day`,[client.clientId,day.id]);
      const products: Array<{ id: string; price: number; tracks: boolean }> = await m.query(`SELECT p.id_producto AS id,p.precio_ctvs AS price,p.controla_inventario AS tracks FROM producto p JOIN categoria c ON c.id_categoria=p.id_categoria WHERE p.id_producto=ANY($1::uuid[]) AND p.activo AND p.visible_menu AND c.activa ORDER BY p.id_producto FOR SHARE OF p,c`, [ids]);
      if (products.length !== ids.length) throw new ConflictException('Uno o más productos no están disponibles.');
      const inventory: Array<{ id: string; product: string; available: number }> = await m.query(`SELECT id_inventario AS id,id_producto AS product,cantidad_fisica-cantidad_reservada AS available FROM inventario_diario WHERE id_jornada=$1 AND id_producto=ANY($2::uuid[]) ORDER BY id_producto FOR UPDATE`, [account.day, ids]);
      let total = 0;
      for (const item of dto.items) {
        const product = products.find(p => p.id === item.productId.toLowerCase())!;
        const stock = inventory.find(i => i.product === product.id);
        if (product.tracks && (!stock || stock.available < item.quantity)) throw new ConflictException('Inventario insuficiente o sin inicializar.');
        total += product.price * item.quantity;
      }
      if (!Number.isSafeInteger(total)) throw new ConflictException('El total supera el límite permitido.');
      const shipping=Number(request.tarifa_ctvs);
      if (!Number.isSafeInteger(total+shipping) || total+shipping<=0) throw new ConflictException('El total debe ser positivo y seguro.');
      const [order]=await m.query(`INSERT INTO pedido(id_jornada,id_cuenta,actor_usuario,modalidad) VALUES ($1,$2,$3,'delivery') RETURNING id_pedido AS id`,[day.id,account.id,client.userId]);
      await m.query(`INSERT INTO entrega_domicilio(id_pedido,id_solicitud,destinatario,telefono,direccion,referencias,latitud,longitud,version_configuracion,tarifa_ctvs,comprobante_hasta) SELECT $1,id_solicitud,destinatario,telefono,direccion,referencias,latitud,longitud,$3,tarifa_ctvs,clock_timestamp()+make_interval(secs => $4) FROM solicitud_domicilio WHERE id_solicitud=$2`,[order.id,requestId,request.version,settings.comprobante_plazo_seg]);
      const [version] = await m.query(`INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs,observaciones) VALUES ($1,1,'current',$2,$3) RETURNING id_version AS id`, [order.id, total, dto.notes ?? null]);
      for (const item of dto.items) {
        const product = products.find(p => p.id === item.productId.toLowerCase())!;
        const [detail] = await m.query(`INSERT INTO detalle_pedido(id_version,id_producto,cantidad,precio_unitario_ctvs,controla_stock_snapshot,observaciones) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_detalle AS id`, [version.id, product.id, item.quantity, product.price, product.tracks, item.notes ?? null]);
        await m.query(`INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES ($1,$2,$3)`, [detail.id, account.id, item.quantity]);
        if (product.tracks) {
          const stock = inventory.find(i => i.product === product.id)!;
          await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada+$2 WHERE id_inventario=$1', [stock.id, item.quantity]);
          await m.query('INSERT INTO reserva_inventario(id_detalle,id_inventario,cantidad) VALUES ($1,$2,$3)', [detail.id, stock.id, item.quantity]);
        }
      }
      await m.query(`INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_sesion_cliente,actor_tipo,evento,estado_nuevo) VALUES ($1,$2,$3,$4,$5,'order.submitted','submitted')`, [order.id, version.id, actor.userId ?? null, actor.guestSessionId ?? null, actor.guestSessionId ? 'sesion_cliente' : 'usuario']);
      const [bill]=await m.query(`INSERT INTO liquidacion(id_cuenta,id_caja,productos_ctvs,envio_ctvs,total_ctvs,creada_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_liquidacion AS id`,[account.id,day.cash,total,shipping,total+shipping,client.userId]);
      await m.query(`INSERT INTO detalle_liquidacion(id_liquidacion,id_asignacion,cantidad_snapshot,precio_snapshot_ctvs,importe_ctvs) SELECT $1,a.id_asignacion,a.cantidad,d.precio_unitario_ctvs,a.cantidad::bigint*d.precio_unitario_ctvs FROM asignacion_consumo a JOIN detalle_pedido d ON d.id_detalle=a.id_detalle WHERE a.id_cuenta=$2`,[bill.id,account.id]);
      await auditTableOperation(m,actor,'pedido',order.id,'delivery.order_submitted',{requestId,accountId:account.id,settlementId:bill.id,totalCents:total+shipping});
      return { resourceId: order.id, response: await this.detail(order.id, client.clientId, false, m) };
    });
  }

  async detail(id: string, clientId?: string, history = false, m: EntityManager = this.db.manager) {
    const [order] = await m.query(`SELECT o.id_pedido AS id,o.modalidad AS modality,o.id_visita AS "visitId",o.id_jornada AS "operatingDayId",o.id_cuenta AS "accountId",o.estado AS status,o.enviado_en AS "submittedAt",o.editable_hasta AS "editableUntil",COALESCE(o.estado='submitted' AND o.editable_hasta>clock_timestamp() AND c.estado='open' AND p.estado='approved' AND vm.estado='open' AND t.activa AND j.estado='open' AND j.fecha_operativa=timezone(cfg.zona_horaria,clock_timestamp())::date,false) AS "canEdit",v.id_version AS "versionId",v.numero AS version,v.observaciones AS notes,v.total_productos_ctvs::float8 AS "totalCents",'USD' AS currency FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta LEFT JOIN participante p ON p.id_participante=c.id_participante LEFT JOIN visita_mesa vm ON vm.id_visita=o.id_visita LEFT JOIN mesa t ON t.id_mesa=vm.id_mesa JOIN jornada_operativa j ON j.id_jornada=o.id_jornada JOIN configuracion_operativa cfg ON cfg.id_configuracion=1 JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`, [id, clientId ?? null]);
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    const [delivery]=await m.query(`SELECT comprobante_hasta AS "receiptSubmissionDeadline",despachado_en AS "dispatchedAt",despachado_por AS "dispatchedBy",entregado_en AS "deliveredAt",entregado_por AS "deliveredBy",id_solicitud AS "requestId",destinatario AS "recipientName",telefono AS phone,direccion AS address,referencias AS references,latitud AS latitude,longitud AS longitude,version_configuracion AS "configurationVersion",tarifa_ctvs::float8 AS "shippingCents" FROM entrega_domicilio WHERE id_pedido=$1`,[id]);
    order.delivery=delivery ?? null; order.productsCents=order.totalCents; order.shippingCents=delivery?.shippingCents ?? 0; order.totalCents+=order.shippingCents;
    const [bill]=await m.query('SELECT id_liquidacion AS id,estado AS status FROM liquidacion WHERE id_cuenta=$1 ORDER BY creada_en DESC LIMIT 1',[order.accountId]); order.settlement=bill ?? null;
    order.items = await m.query(`SELECT d.id_detalle AS id,d.id_producto AS "productId",d.cantidad AS quantity,d.precio_unitario_ctvs AS "unitPriceCents",(d.cantidad::bigint*d.precio_unitario_ctvs)::float8 AS "subtotalCents",d.controla_stock_snapshot AS "tracksInventory",d.observaciones AS notes FROM detalle_pedido d WHERE d.id_version=$1 ORDER BY d.id_producto`, [order.versionId]);
    if (history) order.history = await m.query(`SELECT actor_tipo AS "actorType",actor_usuario AS "userId",actor_sesion_cliente AS "guestSessionId",evento AS event,estado_anterior AS "previousStatus",estado_nuevo AS "newStatus",motivo AS reason,ocurrido_en AS "occurredAt" FROM historial_pedido WHERE id_pedido=$1 ORDER BY ocurrido_en,id_historial`, [id]);
    return order;
  }

  async history(id:string, clientId?:string) {
    await this.detail(id,clientId);
    const versions = await this.db.query(`SELECT id_version AS id,numero AS version,estado AS status,total_productos_ctvs::float8 AS "totalCents",observaciones AS notes,creada_en AS "createdAt" FROM version_pedido WHERE id_pedido=$1 ORDER BY numero`,[id]);
    for (const version of versions) version.items = await this.db.query(`SELECT id_detalle AS id,id_producto AS "productId",cantidad AS quantity,precio_unitario_ctvs AS "unitPriceCents",controla_stock_snapshot AS "tracksInventory",observaciones AS notes FROM detalle_pedido WHERE id_version=$1 ORDER BY id_producto`,[version.id]);
    const events = await this.db.query(`SELECT actor_tipo AS "actorType",actor_usuario AS "userId",actor_sesion_cliente AS "guestSessionId",evento AS event,estado_anterior AS "previousStatus",estado_nuevo AS "newStatus",motivo AS reason,ocurrido_en AS "occurredAt" FROM historial_pedido WHERE id_pedido=$1 ORDER BY ocurrido_en,id_historial`,[id]);
    return {versions,events};
  }

  async list(query: OrderQueryDto | AdminOrderQueryDto, clientId?: string) {
    const admin = query as AdminOrderQueryDto;
    const args = [clientId ?? null, query.visitId ?? null, admin.tableId ?? null, admin.operatingDayId ?? null, query.status ?? null,query.modality ?? null];
    const where = `($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::uuid IS NULL OR o.id_visita=$2) AND ($3::uuid IS NULL OR v.id_mesa=$3) AND ($4::uuid IS NULL OR o.id_jornada=$4) AND ($5::text IS NULL OR o.estado=$5) AND ($6::text IS NULL OR o.modalidad=$6)`;
    const from = 'FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta LEFT JOIN visita_mesa v ON v.id_visita=o.id_visita';
    const [{ total }] = await this.db.query(`SELECT count(*)::int AS total ${from} WHERE ${where}`, args);
    const rows: Array<{ id: string }> = await this.db.query(`SELECT o.id_pedido AS id ${from} WHERE ${where} ORDER BY o.enviado_en DESC,o.id_pedido DESC LIMIT $7 OFFSET $8`, [...args, query.limit, (query.page-1)*query.limit]);
    const items = await Promise.all(rows.map(async row => { const detail=await this.detail(row.id,clientId); delete detail.delivery; return detail; }));
    return { items, total, page: query.page, limit: query.limit };
  }
}
