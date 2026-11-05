import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClientAccessGuard } from '../tables/client-access.guard.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { PointsController } from './points.controller.js';
import { PointsService } from './points.service.js';
import { GuestSessionsService } from '../tables/guest-sessions.service.js';
@Module({
  imports: [AuthModule],
  controllers: [PointsController],
  providers: [
    PointsService,
    ParticipationIdempotencyService,
    ClientAccessGuard,
    GuestSessionsService,
  ],
})
export class PointsModule {}
