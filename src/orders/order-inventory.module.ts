import { Module } from '@nestjs/common';
import { OrderInventoryService } from './order-inventory.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [OrderInventoryService],
  exports: [OrderInventoryService],
})
export class OrderInventoryModule {}
