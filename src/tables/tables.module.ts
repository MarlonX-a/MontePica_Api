import { DeliveryExpiryService } from './delivery-expiry.service.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TablesController } from './tables.controller.js';
import { GuestSessionsController } from './guest-sessions.controller.js';
import { TableAccessController } from './table-access.controller.js';
import { TablesService } from './tables.service.js';
import { GuestSessionsService } from './guest-sessions.service.js';
import { TableAccessService } from './table-access.service.js';
import { ClientAccessGuard, GuestSessionGuard } from './client-access.guard.js';
import { ClientParticipantsController, AdminParticipantsController } from './participants.controller.js';
import { ParticipantsService } from './participants.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { ClientOrdersController, AdminOrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { AdminSettlementsController, ClientSettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';
import { AdminPaymentsController, ClientPaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { ReceiptStorageService } from './receipt-storage.service.js';
import { AdminTransfersController, ClientTransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';
import { CancellationsService } from './cancellations.service.js';
import { AdminCancellationsController, ClientCancellationsController } from './cancellations.controller.js';
import { PointsService } from '../points/points.service.js';
import { RewardsModule } from '../rewards/rewards.module.js';

@Module({
  imports: [AuthModule, RewardsModule],
  controllers: [TablesController, GuestSessionsController, TableAccessController, ClientParticipantsController, AdminParticipantsController, ClientOrdersController, AdminOrdersController, ClientSettlementsController, AdminSettlementsController, ClientPaymentsController, AdminPaymentsController, ClientTransfersController, AdminTransfersController, ClientCancellationsController, AdminCancellationsController],
  providers: [DeliveryExpiryService, PointsService, TablesService, GuestSessionsService, TableAccessService, ClientAccessGuard, GuestSessionGuard, ParticipantsService, ParticipationIdempotencyService, OrdersService, SettlementsService, PaymentsService, ReceiptStorageService, TransfersService, CancellationsService],
})
export class TablesModule {}
