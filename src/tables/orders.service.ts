import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { ClientIdentity } from './client-access.guard.js';
import type { AdminOrderQueryDto, CreateOrderDto, EditOrderDto, OrderQueryDto, OrderTransitionDto, CancelOrderDto } from './orders.dto.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { ParticipantsService } from './participants.service.js';
import { auditTableOperation } from './table-audit.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

@Injectable()
export class OrdersService {
  constructor(private readonly db: DataSource, private readonly idempotency: ParticipationIdempotencyService, private readonly participants: ParticipantsService) {}

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

  async transition(id: string, action: 'cancel' | 'start-preparation' | 'ready' | 'deliver', dto: OrderTransitionDto | CancelOrderDto, actor: { userId?: string; guestSessionId?: string }, client?: ClientIdentity, key?: string) {
    return this.idempotency.run(actor, `orders/${id.toLowerCase()}/${action}`, key, dto, 200, 'pedido', async m => {
      if (client) { await this.participants.authenticate(m, client); await this.detail(id, client.clientId, false, m); }
    }, async m => {
      const zone = await lockTableOperations(m);
      const [ref] = await m.query('SELECT id_visita FROM pedido WHERE id_pedido=$1', [id]);
      if (!ref) throw new NotFoundException('Pedido no encontrado.');
      if (action === 'start-preparation') await lockActiveVisit(m, ref.id_visita, zone);
      const [order] = await m.query(`SELECT o.estado,o.id_cuenta,v.id_version,v.numero FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 FOR UPDATE OF o,v`, [id]);
      const expected: Record<string, string> = { cancel:'submitted', 'start-preparation':'submitted', ready:'preparing', deliver:'ready' };
      if (order.numero !== dto.expectedVersion || order.estado !== expected[action]) throw new ConflictException('Estado o versión del pedido no válidos.');
      const target: Record<string, string> = { cancel:'cancelled', 'start-preparation':'preparing', ready:'ready', deliver:'delivered' };
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

  async detail(id: string, clientId?: string, history = false, m: EntityManager = this.db.manager) {
    const [order] = await m.query(`SELECT o.id_pedido AS id,o.id_visita AS "visitId",o.id_jornada AS "operatingDayId",o.id_cuenta AS "accountId",o.estado AS status,o.enviado_en AS "submittedAt",o.editable_hasta AS "editableUntil",COALESCE(o.estado='submitted' AND o.editable_hasta>clock_timestamp() AND c.estado='open' AND p.estado='approved' AND vm.estado='open' AND t.activa AND j.estado='open' AND j.fecha_operativa=timezone(cfg.zona_horaria,clock_timestamp())::date,false) AS "canEdit",v.id_version AS "versionId",v.numero AS version,v.observaciones AS notes,v.total_productos_ctvs::float8 AS "totalCents",'USD' AS currency FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta JOIN participante p ON p.id_participante=c.id_participante JOIN visita_mesa vm ON vm.id_visita=o.id_visita JOIN mesa t ON t.id_mesa=vm.id_mesa JOIN jornada_operativa j ON j.id_jornada=o.id_jornada JOIN configuracion_operativa cfg ON cfg.id_configuracion=1 JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`, [id, clientId ?? null]);
    if (!order) throw new NotFoundException('Pedido no encontrado.');
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
    const args = [clientId ?? null, query.visitId ?? null, admin.tableId ?? null, admin.operatingDayId ?? null, query.status ?? null];
    const where = `($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::uuid IS NULL OR o.id_visita=$2) AND ($3::uuid IS NULL OR v.id_mesa=$3) AND ($4::uuid IS NULL OR o.id_jornada=$4) AND ($5::text IS NULL OR o.estado=$5)`;
    const from = 'FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta JOIN visita_mesa v ON v.id_visita=o.id_visita';
    const [{ total }] = await this.db.query(`SELECT count(*)::int AS total ${from} WHERE ${where}`, args);
    const rows: Array<{ id: string }> = await this.db.query(`SELECT o.id_pedido AS id ${from} WHERE ${where} ORDER BY o.enviado_en DESC,o.id_pedido DESC LIMIT $6 OFFSET $7`, [...args, query.limit, (query.page-1)*query.limit]);
    const items = await Promise.all(rows.map(row => this.detail(row.id, clientId)));
    return { items, total, page: query.page, limit: query.limit };
  }
}
