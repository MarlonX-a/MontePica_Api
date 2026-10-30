import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TablesController } from './tables.controller.js';
import { GuestSessionsController } from './guest-sessions.controller.js';
import { TableAccessController } from './table-access.controller.js';
import { TablesService } from './tables.service.js';
import { GuestSessionsService } from './guest-sessions.service.js';
import { TableAccessService } from './table-access.service.js';
import { ClientAccessGuard, GuestSessionGuard } from './client-access.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [TablesController, GuestSessionsController, TableAccessController],
  providers: [TablesService, GuestSessionsService, TableAccessService, ClientAccessGuard, GuestSessionGuard],
})
export class TablesModule {}
