import type { EntityManager } from 'typeorm';
import { auditTableOperation } from './table-audit.js';
// Caller holds the common operational lock. Each invocation is part of its caller transaction.
export async function expireDelivery(m:EntityManager,id:string):Promise<boolean> {
 const [o]=await m.query(`SELECT o.id_cuenta,v.id_version FROM pedido o JOIN entrega_domicilio e ON e.id_pedido=o.id_pedido JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 AND o.estado='submitted' AND e.comprobante_hasta<=clock_timestamp() FOR UPDATE OF o,v,e`,[id]);
 if (!o) return false;
 await m.query('SELECT 1 FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',[o.id_cuenta]);
 const [payment]=await m.query(`SELECT 1 FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado IN ('confirmed','pendingVerification')`,[o.id_cuenta]);
 if (payment) return false;
 const reserves:Array<{id:string;inventory:string;quantity:number}>=await m.query(`SELECT r.id_reserva AS id,r.id_inventario AS inventory,r.cantidad AS quantity FROM reserva_inventario r JOIN detalle_pedido d ON d.id_detalle=r.id_detalle JOIN inventario_diario i ON i.id_inventario=r.id_inventario WHERE d.id_version=$1 AND r.estado='active' ORDER BY i.id_producto FOR UPDATE OF i,r`,[o.id_version]);
 for (const r of reserves) {await m.query('UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-$2 WHERE id_inventario=$1',[r.inventory,r.quantity]);await m.query(`UPDATE reserva_inventario SET estado='released',resuelta_en=clock_timestamp() WHERE id_reserva=$1`,[r.id]);}
 await m.query(`UPDATE asignacion_consumo SET estado='superseded' WHERE id_cuenta=$1 AND estado='active'`,[o.id_cuenta]);
 await m.query(`UPDATE liquidacion SET estado='cancelled',anulada_en=clock_timestamp(),motivo_anulacion='receiptDeadlineExpired' WHERE id_cuenta=$1 AND estado='pending'`,[o.id_cuenta]);
 await m.query(`UPDATE detalle_liquidacion SET vigente=false WHERE id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=$1)`,[o.id_cuenta]);
 await m.query(`UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,[o.id_cuenta]);
 await m.query(`UPDATE pedido SET estado='cancelled' WHERE id_pedido=$1`,[id]);
 await m.query(`INSERT INTO historial_pedido(id_pedido,id_version,actor_tipo,evento,estado_anterior,estado_nuevo,motivo) VALUES ($1,$2,'system','order.expired','submitted','cancelled','receiptDeadlineExpired')`,[id,o.id_version]);
 await auditTableOperation(m,{},'pedido',id,'order.expired',{reason:'receiptDeadlineExpired'});return true;
}
