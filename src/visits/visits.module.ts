import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { TableAccessController } from './table-access.controller.js';
import { TableAccessService } from './table-access.service.js';
import { VisitsController } from './visits.controller.js';
import { VisitsService } from './visits.service.js';

@Module({
  imports: [ClientIdentityModule, TransactionsModule, AuthModule, AuditModule],
  controllers: [TableAccessController, VisitsController],
  providers: [TableAccessService, VisitsService],
  exports: [TableAccessService, VisitsService],
})
export class VisitsModule {}
