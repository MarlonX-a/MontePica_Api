import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { RestaurantTable } from './entities/restaurant-table.entity.js';
import { TablesController } from './tables.controller.js';
import { TablesService } from './tables.service.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    TransactionsModule,
    TypeOrmModule.forFeature([RestaurantTable]),
  ],
  controllers: [TablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
