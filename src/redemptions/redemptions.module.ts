import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { AdminRedemptionsController } from './admin-redemptions.controller.js';
import { ClientRedemptionsController } from './client-redemptions.controller.js';
import { RedemptionRequest } from './entities/redemption-request.entity.js';
import { RedemptionDecisionService } from './redemption-decision.service.js';
import { RedemptionExpiryService } from './redemption-expiry.service.js';
import { RedemptionReservationsModule } from './redemption-reservations.module.js';
import { RedemptionsQueryService } from './redemptions-query.service.js';
import { RedemptionsService } from './redemptions.service.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    IdempotencyModule,
    AuditModule,
    TransactionsModule,
    IdentityModule,
    RedemptionReservationsModule,
    TypeOrmModule.forFeature([RedemptionRequest]),
  ],
  controllers: [AdminRedemptionsController, ClientRedemptionsController],
  providers: [
    RedemptionDecisionService,
    RedemptionExpiryService,
    RedemptionsQueryService,
    RedemptionsService,
  ],
  exports: [
    RedemptionDecisionService,
    RedemptionExpiryService,
    RedemptionsQueryService,
    RedemptionsService,
  ],
})
export class RedemptionsModule {}
