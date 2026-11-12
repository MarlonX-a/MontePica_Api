import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { Order } from '../orders/entities/order.entity.js';
import { DeliveryLifecycleService } from './delivery-lifecycle.service.js';
import { DeliveryDetails } from './entities/delivery-details.entity.js';
import { DeliveryRequest } from './entities/delivery-request.entity.js';
import { SweepFindPedidoRow } from './types/delivery-expiry.types.js';

@Injectable()
export class DeliveryExpiryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  private active?: Promise<void>;
  private readonly logger = new Logger(DeliveryExpiryService.name);
  constructor(
    @InjectRepository(DeliveryRequest)
    private readonly records: Repository<DeliveryRequest>,
    private readonly db: DataSource,
    private readonly operationalContext: OperationalContextService,
    private readonly deliveryLifecycle: DeliveryLifecycleService,
  ) {}

  async onApplicationBootstrap() {
    this.active = this.sweep();
    await this.active;
    this.timer = setInterval(() => {
      if (!this.running) this.active = this.sweep();
    }, 60000);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }

  async sweep(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const rows: Array<{ id: string }> = await this.sweepFindPedido(
        this.records.manager,
      );
      for (const row of rows) {
        if (this.stopped) break;
        try {
          await this.db.transaction(async (m) => {
            await this.operationalContext.lockTableOperations(m);
            await this.deliveryLifecycle.expireDelivery(m, row.id);
          });
        } catch {
          this.logger.error(
            'No se pudo resolver un domicilio vencido; se reintentara.',
          );
        }
      }
    } catch {
      this.logger.error(
        'No se pudo consultar domicilios vencidos; se reintentara.',
      );
    } finally {
      this.running = false;
    }
  }

  private async sweepFindPedido(
    manager: EntityManager,
  ): Promise<SweepFindPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('o.id_pedido AS id')
      .innerJoin(DeliveryDetails, 'e', 'e.id_pedido=o.id_pedido')
      .where("o.estado='submitted' AND e.comprobante_hasta<=clock_timestamp()")
      .addOrderBy('e.comprobante_hasta', 'ASC')
      .addOrderBy('o.id_pedido', 'ASC')
      .getRawMany<SweepFindPedidoRow>();
  }
}
