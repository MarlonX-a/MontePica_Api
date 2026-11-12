import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../common/audit/audit.module.js';
import { GuestSessionGuard } from '../common/identity/client-access.guard.js';
import { GuestSession } from './entities/guest-session.entity.js';
import { GuestSessionsController } from './guest-sessions.controller.js';
import { GuestSessionsService } from './guest-sessions.service.js';

@Module({
  imports: [AuditModule, TypeOrmModule.forFeature([GuestSession])],
  controllers: [GuestSessionsController],
  providers: [GuestSessionGuard, GuestSessionsService],
  exports: [GuestSessionGuard, GuestSessionsService],
})
export class GuestSessionsModule {}
