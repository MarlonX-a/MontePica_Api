import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { PointsLedgerService } from './points-ledger.service.js';
import { PointsBalanceService } from './points-balance.service.js';

@Module({
  imports: [AuditModule],
  controllers: [],
  providers: [PointsLedgerService, PointsBalanceService],
  exports: [PointsLedgerService, PointsBalanceService],
})
export class PointsLedgerModule {}
