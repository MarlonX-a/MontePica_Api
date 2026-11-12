import { Module } from '@nestjs/common';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { BootstrapService } from './bootstrap.service.js';

@Module({
  imports: [TransactionsModule],
  controllers: [],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
