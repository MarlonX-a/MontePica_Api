import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClientAccessGuard } from '../tables/client-access.guard.js';
import { GuestSessionsService } from '../tables/guest-sessions.service.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { AdminRedemptionsController, AdminRewardsController, ClientRedemptionsController, RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';
@Module({imports:[AuthModule],controllers:[RewardsController,AdminRewardsController,ClientRedemptionsController,AdminRedemptionsController],providers:[RewardsService,ParticipationIdempotencyService,ClientAccessGuard,GuestSessionsService],exports:[RewardsService]})
export class RewardsModule {}
