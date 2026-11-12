import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { validateDatabaseEnvironment } from '../config/environment.validation.js';
import { databaseEntities } from './entities.js';
import { ParameterlessQueryLogger } from './parameterless-query.logger.js';

const databaseDirectory = dirname(fileURLToPath(import.meta.url));

export function createDatabaseOptions(
  raw: Record<string, unknown>,
): PostgresConnectionOptions {
  const env = validateDatabaseEnvironment(raw);

  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: databaseEntities,
    migrations: [
      join(databaseDirectory, 'migrations/*{.ts,.js}').replaceAll('\\', '/'),
    ],
    synchronize: false,
    migrationsRun: false,
    logging: env.DB_LOGGING,
    logger: new ParameterlessQueryLogger(env.DB_LOGGING),
  };
}
