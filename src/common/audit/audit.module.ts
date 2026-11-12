import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
