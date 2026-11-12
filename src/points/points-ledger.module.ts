import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { PointsLedgerService } from './points-ledger.service.js';

@Module({
  imports: [AuditModule],
  controllers: [],
  providers: [PointsLedgerService],
  exports: [PointsLedgerService],
})
export class PointsLedgerModule {}
