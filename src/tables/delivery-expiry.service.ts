import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { expireDelivery } from './delivery-expiry.js';
import { DeliveryExpiryRepository } from './repositories/delivery-expiry.repository.js';
import { lockTableOperations } from './table-operations.js';
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
    private readonly db: DataSource,
    private readonly persistence: DeliveryExpiryRepository = new DeliveryExpiryRepository(),
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
      const rows: Array<{ id: string }> =
        await this.persistence.sweepFindPedido(this.db.manager);
      for (const row of rows) {
        if (this.stopped) break;
        try {
          await this.db.transaction(async (m) => {
            await lockTableOperations(m);
            await expireDelivery(m, row.id);
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
}
