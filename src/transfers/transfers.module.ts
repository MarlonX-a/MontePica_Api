import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountLifecycleModule } from '../accounts/account-lifecycle.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { StorageModule } from '../common/storage/storage.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { DeliveryLifecycleModule } from '../delivery/delivery-lifecycle.module.js';
import { ParticipantsModule } from '../participants/participants.module.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PointsLedgerModule } from '../points/points-ledger.module.js';
import { RedemptionReservationsModule } from '../redemptions/redemption-reservations.module.js';
import { AdminTransfersController } from './admin-transfers.controller.js';
import { ClientTransfersController } from './client-transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    IdempotencyModule,
    StorageModule,
    ParticipantsModule,
    PointsLedgerModule,
    RedemptionReservationsModule,
    AuditModule,
    TransactionsModule,
    DeliveryLifecycleModule,
    IdentityModule,
    AccountLifecycleModule,
    TypeOrmModule.forFeature([Payment]),
  ],
  controllers: [AdminTransfersController, ClientTransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
