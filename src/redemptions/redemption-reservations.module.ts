import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { RedemptionReservationsService } from './redemption-reservations.service.js';

@Module({
  imports: [AuditModule],
  controllers: [],
  providers: [RedemptionReservationsService],
  exports: [RedemptionReservationsService],
})
export class RedemptionReservationsModule {}
