import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { PointsLedgerModule } from '../points/points-ledger.module.js';
import { AdminRefundsController } from './admin-refunds.controller.js';
import { ClientRefundsController } from './client-refunds.controller.js';
import { Refund } from './entities/refund.entity.js';
import { RefundsService } from './refunds.service.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    IdempotencyModule,
    PointsLedgerModule,
    AuditModule,
    TransactionsModule,
    IdentityModule,
    TypeOrmModule.forFeature([Refund]),
  ],
  controllers: [AdminRefundsController, ClientRefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
