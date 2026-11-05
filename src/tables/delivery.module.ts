import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PointsService } from '../points/points.service.js';
import { RewardsModule } from '../rewards/rewards.module.js';
import { ClientAccessGuard } from './client-access.guard.js';
import {
  AdminDeliveryController,
  ClientDeliveryController,
  DeliveryPublicController,
  RegisteredClientGuard,
} from './delivery.controller.js';
import { DeliveryService } from './delivery.service.js';
import { GuestSessionsService } from './guest-sessions.service.js';
import { OrdersQueryService } from './orders-query.service.js';
import { OrdersService } from './orders.service.js';
import { ParticipantsService } from './participants.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';

@Module({
  imports: [AuthModule, RewardsModule],
  controllers: [
    DeliveryPublicController,
    ClientDeliveryController,
    AdminDeliveryController,
  ],
  providers: [
    OrdersQueryService,
    PointsService,
    ClientAccessGuard,
    GuestSessionsService,
    ParticipationIdempotencyService,
    ParticipantsService,
    RegisteredClientGuard,
    DeliveryService,
    OrdersService,
  ],
})
export class DeliveryModule {}
