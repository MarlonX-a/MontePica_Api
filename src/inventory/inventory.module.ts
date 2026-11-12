import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { DailyInventory } from './entities/daily-inventory.entity.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    TransactionsModule,
    TypeOrmModule.forFeature([DailyInventory]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
