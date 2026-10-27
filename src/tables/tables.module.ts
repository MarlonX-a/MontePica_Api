import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TablesController, GuestSessionsController, TableAccessController } from './tables.controller.js';
import { TablesService } from './tables.service.js';

@Module({ imports: [AuthModule], controllers: [TablesController, GuestSessionsController, TableAccessController], providers: [TablesService] })
export class TablesModule {}
