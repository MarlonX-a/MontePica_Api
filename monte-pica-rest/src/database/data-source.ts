import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from './database.options.js';

export default new DataSource(createDatabaseOptions(process.env));
