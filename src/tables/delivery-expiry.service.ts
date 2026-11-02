import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { expireDelivery } from './delivery-expiry.js';
import { lockTableOperations } from './table-operations.js';
@Injectable()
export class DeliveryExpiryService implements OnApplicationBootstrap,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>;private running=false;private stopped=false;private active?:Promise<void>;
 private readonly logger=new Logger(DeliveryExpiryService.name);
 constructor(private readonly db:DataSource) {}
 async onApplicationBootstrap() {this.active=this.sweep();await this.active;this.timer=setInterval(()=>{if(!this.running)this.active=this.sweep();},60000);this.timer.unref();}
 async onModuleDestroy() {this.stopped=true;if(this.timer)clearInterval(this.timer);await this.active;}
 async sweep():Promise<void> {
 if(this.running || this.stopped)return;this.running=true;
 try {
 const rows:Array<{id:string}>=await this.db.query(`SELECT o.id_pedido AS id FROM pedido o JOIN entrega_domicilio e ON e.id_pedido=o.id_pedido WHERE o.estado='submitted' AND e.comprobante_hasta<=clock_timestamp() ORDER BY e.comprobante_hasta,o.id_pedido`);
 for(const row of rows){if(this.stopped)break;try{await this.db.transaction(async m=>{await lockTableOperations(m);await expireDelivery(m,row.id);});}catch{this.logger.error('No se pudo resolver un domicilio vencido; se reintentara.');}}
 }catch{this.logger.error('No se pudo consultar domicilios vencidos; se reintentara.');}finally{this.running=false;}
 }
}
