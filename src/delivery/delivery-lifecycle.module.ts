import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { DeliveryLifecycleService } from './delivery-lifecycle.service.js';

@Module({
  imports: [AuditModule],
  controllers: [],
  providers: [DeliveryLifecycleService],
  exports: [DeliveryLifecycleService],
})
export class DeliveryLifecycleModule {}
