import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnvironment } from './config/environment.validation.js';
import { createDatabaseOptions } from './database/database.options.js';
import { HealthModule } from './health/health.module.js';
import { CatalogModule } from './catalog/catalog.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
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
  ],
})
export class AppModule {}
