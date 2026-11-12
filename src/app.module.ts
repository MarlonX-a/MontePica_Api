import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from './accounts/accounts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CancellationsModule } from './cancellations/cancellations.module.js';
import { CashModule } from './cash/cash.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { validateEnvironment } from './config/environment.validation.js';
import { createDatabaseOptions } from './database/database.options.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { GuestSessionsModule } from './guest-sessions/guest-sessions.module.js';
import { HealthModule } from './health/health.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ParticipantsModule } from './participants/participants.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PointsModule } from './points/points.module.js';
import { RedemptionsModule } from './redemptions/redemptions.module.js';
import { RefundsModule } from './refunds/refunds.module.js';
import { RewardsModule } from './rewards/rewards.module.js';
import { RolesModule } from './roles/roles.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { TablesModule } from './tables/tables.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { UsersModule } from './users/users.module.js';
import { VisitsModule } from './visits/visits.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...createDatabaseOptions({
          NODE_ENV: config.get('NODE_ENV'),
          DB_HOST: config.getOrThrow('DB_HOST'),
          DB_PORT: config.getOrThrow('DB_PORT'),
          DB_USERNAME: config.getOrThrow('DB_USERNAME'),
          DB_PASSWORD: config.getOrThrow('DB_PASSWORD'),
          DB_NAME: config.getOrThrow('DB_NAME'),
          DB_LOGGING: config.get('DB_LOGGING'),
        }),
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),
    AccountsModule,
    AuthModule,
    CancellationsModule,
    CashModule,
    CatalogModule,
    GuestSessionsModule,
    DeliveryModule,
    HealthModule,
    InventoryModule,
    OperationsModule,
    OrdersModule,
    ParticipantsModule,
    PaymentsModule,
    PointsModule,
    RedemptionsModule,
    RefundsModule,
    RewardsModule,
    RolesModule,
    SettlementsModule,
    TablesModule,
    TransfersModule,
    UsersModule,
    VisitsModule,
  ],
})
export class AppModule {}
