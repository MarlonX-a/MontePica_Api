import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountLifecycleModule } from '../accounts/account-lifecycle.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { RedemptionReservationsModule } from '../redemptions/redemption-reservations.module.js';
import { AdminParticipantsController } from './admin-participants.controller.js';
import { ClientParticipantsController } from './client-participants.controller.js';
import { Participant } from './entities/participant.entity.js';
import { ParticipantsService } from './participants.service.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    IdempotencyModule,
    RedemptionReservationsModule,
    AuditModule,
    TransactionsModule,
    AccountLifecycleModule,
    TypeOrmModule.forFeature([Participant]),
  ],
  controllers: [AdminParticipantsController, ClientParticipantsController],
  providers: [ParticipantsService],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
