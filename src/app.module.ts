import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnvironment } from './config/environment.validation.js';
import { createDatabaseOptions } from './database/database.options.js';
import { HealthModule } from './health/health.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { TablesModule } from './tables/tables.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
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
    HealthModule,
    CatalogModule,
    AuthModule,
    AdminModule,
    OperationsModule,
    InventoryModule,
    TablesModule,
  ],
})
export class AppModule {}
