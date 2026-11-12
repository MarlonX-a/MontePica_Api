import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountLifecycleModule } from '../accounts/account-lifecycle.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { ParticipantsModule } from '../participants/participants.module.js';
import { PointsLedgerModule } from '../points/points-ledger.module.js';
import { RedemptionReservationsModule } from '../redemptions/redemption-reservations.module.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { ClientOrdersController } from './client-orders.controller.js';
import { Order } from './entities/order.entity.js';
import { OrderInventoryModule } from './order-inventory.module.js';
import { OrdersEditingService } from './orders-editing.service.js';
import { OrdersLifecycleService } from './orders-lifecycle.service.js';
import { OrdersQueryService } from './orders-query.service.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    IdempotencyModule,
    ParticipantsModule,
    AuditModule,
    TransactionsModule,
    OrderInventoryModule,
    PointsLedgerModule,
    RedemptionReservationsModule,
    IdentityModule,
    AccountLifecycleModule,
    TypeOrmModule.forFeature([Order]),
  ],
  controllers: [AdminOrdersController, ClientOrdersController],
  providers: [
    OrdersEditingService,
    OrdersLifecycleService,
    OrdersQueryService,
    OrdersService,
  ],
  exports: [
    OrdersEditingService,
    OrdersLifecycleService,
    OrdersQueryService,
    OrdersService,
  ],
})
export class OrdersModule {}
