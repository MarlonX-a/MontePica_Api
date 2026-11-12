import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { ParticipantsModule } from '../participants/participants.module.js';
import { RedemptionReservationsModule } from '../redemptions/redemption-reservations.module.js';
import { OperatingDay } from './entities/operating-day.entity.js';
import { OperationsSettings } from './entities/operations-settings.entity.js';
import { OperatingDayClosureService } from './operating-day-closure.service.js';
import { OperatingDaysService } from './operating-days.service.js';
import { OperationsSettingsService } from './operations-settings.service.js';
import { OperationsController } from './operations.controller.js';

@Module({
  imports: [
    IdempotencyModule,
    RedemptionReservationsModule,
    ParticipantsModule,
    DeliveryModule,
    AuditModule,
    IdentityModule,
    TransactionsModule,
    AuthModule,
    TypeOrmModule.forFeature([OperatingDay, OperationsSettings]),
  ],
  controllers: [OperationsController],
  providers: [
    OperatingDayClosureService,
    OperatingDaysService,
    OperationsSettingsService,
  ],
  exports: [
    OperatingDayClosureService,
    OperatingDaysService,
    OperationsSettingsService,
  ],
})
export class OperationsModule {}
