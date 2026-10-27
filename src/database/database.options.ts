import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { validateDatabaseEnvironment } from '../config/environment.validation.js';
import { Category } from '../catalog/entities/category.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { Client } from '../auth/entities/client.entity.js';
import { Profile } from '../auth/entities/profile.entity.js';
import { Role } from '../auth/entities/role.entity.js';
import { User } from '../auth/entities/user.entity.js';
import { UserSession } from '../auth/entities/user-session.entity.js';

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
    entities: [Category, Product, Client, Profile, Role, User, UserSession],
    migrations: [join(databaseDirectory, 'migrations/*{.ts,.js}')],
    synchronize: false,
    migrationsRun: false,
    logging: env.DB_LOGGING,
  };
}
