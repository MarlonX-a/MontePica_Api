import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountLifecycleModule } from '../accounts/account-lifecycle.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { ParticipantsModule } from '../participants/participants.module.js';
import { RedemptionReservationsModule } from '../redemptions/redemption-reservations.module.js';
import { AdminCancellationsController } from './admin-cancellations.controller.js';
import { CancellationsService } from './cancellations.service.js';
import { ClientCancellationsController } from './client-cancellations.controller.js';
import { CancellationRequest } from './entities/cancellation-request.entity.js';

@Module({
  imports: [
    AuthModule,
    IdempotencyModule,
    ParticipantsModule,
    RedemptionReservationsModule,
    AuditModule,
    TransactionsModule,
    IdentityModule,
    AccountLifecycleModule,
    ClientIdentityModule,
    TypeOrmModule.forFeature([CancellationRequest]),
  ],
  controllers: [AdminCancellationsController, ClientCancellationsController],
  providers: [CancellationsService],
  exports: [CancellationsService],
})
export class CancellationsModule {}
