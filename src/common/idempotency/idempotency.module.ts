import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { IdempotencyRecordsService } from './idempotency-records.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';

@Module({
  imports: [TransactionsModule],
  controllers: [],
  providers: [IdempotencyRecordsService, ParticipationIdempotencyService],
  exports: [IdempotencyRecordsService, ParticipationIdempotencyService],
})
export class IdempotencyModule {}
