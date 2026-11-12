import { Module } from '@nestjs/common';
import { OperationalContextService } from './operational-context.service.js';
import { TransactionLocksService } from './transaction-locks.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [OperationalContextService, TransactionLocksService],
  exports: [OperationalContextService, TransactionLocksService],
})
export class TransactionsModule {}
