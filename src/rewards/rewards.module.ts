import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { AdminRewardsController } from './admin-rewards.controller.js';
import { Reward } from './entities/reward.entity.js';
import { RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';

@Module({
  imports: [
    AuthModule,
    IdempotencyModule,
    AuditModule,
    TransactionsModule,
    IdentityModule,
    TypeOrmModule.forFeature([Reward]),
  ],
  controllers: [AdminRewardsController, RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
