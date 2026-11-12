import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountLifecycleModule } from '../accounts/account-lifecycle.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { PointsLedgerModule } from '../points/points-ledger.module.js';
import { RedemptionReservationsModule } from '../redemptions/redemption-reservations.module.js';
import { AdminPaymentsController } from './admin-payments.controller.js';
import { ClientPaymentsController } from './client-payments.controller.js';
import { Payment } from './entities/payment.entity.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    IdempotencyModule,
    PointsLedgerModule,
    RedemptionReservationsModule,
    AuditModule,
    TransactionsModule,
    IdentityModule,
    AccountLifecycleModule,
    TypeOrmModule.forFeature([Payment]),
  ],
  controllers: [AdminPaymentsController, ClientPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
