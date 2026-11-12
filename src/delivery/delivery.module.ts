import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { ParticipantsModule } from '../participants/participants.module.js';
import { AdminDeliveryController } from './admin-delivery.controller.js';
import { ClientDeliveryController } from './client-delivery.controller.js';
import { DeliveryExpiryService } from './delivery-expiry.service.js';
import { DeliveryLifecycleModule } from './delivery-lifecycle.module.js';
import { DeliveryPublicController } from './delivery-public.controller.js';
import { DeliveryService } from './delivery.service.js';
import { DeliveryRequest } from './entities/delivery-request.entity.js';

@Module({
  imports: [
    AuthModule,
    OrdersModule,
    ClientIdentityModule,
    TransactionsModule,
    DeliveryLifecycleModule,
    IdempotencyModule,
    ParticipantsModule,
    AuditModule,
    IdentityModule,
    TypeOrmModule.forFeature([DeliveryRequest]),
  ],
  controllers: [
    AdminDeliveryController,
    ClientDeliveryController,
    DeliveryPublicController,
  ],
  providers: [DeliveryExpiryService, DeliveryService],
  exports: [DeliveryExpiryService, DeliveryService],
})
export class DeliveryModule {}
