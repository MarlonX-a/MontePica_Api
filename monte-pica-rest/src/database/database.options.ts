import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { validateEnvironment } from '../config/environment.validation.js';

const databaseDirectory = dirname(fileURLToPath(import.meta.url));

export function createDatabaseOptions(
  raw: Record<string, unknown>,
): PostgresConnectionOptions {
  const env = validateEnvironment(raw);

  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [join(databaseDirectory, '../**/*.entity{.ts,.js}')],
    migrations: [join(databaseDirectory, 'migrations/*{.ts,.js}')],
    synchronize: false,
    migrationsRun: false,
    logging: env.DB_LOGGING,
  };
}
