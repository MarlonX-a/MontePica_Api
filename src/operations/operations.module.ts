import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { RewardsModule } from '../rewards/rewards.module.js';
import { TablesModule } from '../tables/tables.module.js';
import { DeliveryModule } from '../tables/delivery.module.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';

@Module({
  imports: [AuthModule, RewardsModule, TablesModule, DeliveryModule],
  controllers: [OperationsController],
  providers: [OperationsService, ParticipationIdempotencyService],
})
export class OperationsModule {}
