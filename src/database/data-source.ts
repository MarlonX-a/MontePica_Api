import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from './database.options.js';
import { ParameterlessQueryLogger } from './parameterless-query.logger.js';

export default new DataSource({
  ...createDatabaseOptions(process.env),
  logging: ['schema', 'info', 'warn', 'error'],
  logger: new ParameterlessQueryLogger(['schema', 'info', 'warn', 'error']),
});
