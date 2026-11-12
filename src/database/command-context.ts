import 'dotenv/config';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogSeedModule } from '../catalog/catalog-seed.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { StorageModule } from '../common/storage/storage.module.js';
import {
  validateDatabaseEnvironment,
  validateEnvironment,
} from '../config/environment.validation.js';
import { BootstrapModule } from '../users/bootstrap.module.js';
import { createDatabaseOptions } from './database.options.js';

@Module({})
class CommandContextModule {}

/** A command owns its database connection and providers; it never starts HTTP or expiry tasks. */
export async function createCommandContext(
  kind: 'admin' | 'seed' | 'receipts',
) {
  const feature =
    kind === 'admin'
      ? BootstrapModule
      : kind === 'seed'
        ? CatalogSeedModule
        : StorageModule;
  return NestFactory.createApplicationContext(
    {
      module: CommandContextModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate:
            kind === 'receipts'
              ? validateEnvironment
              : validateDatabaseEnvironment,
        }),
        TypeOrmModule.forRootAsync({
          // Commands do not run migrations or load their source files.
          useFactory: () => ({
            ...createDatabaseOptions(process.env),
            migrations: [],
          }),
        }),
        AuditModule,
        feature,
      ],
    },
    { logger: ['error'] },
  );
}
