import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { AdminSettlementsController } from './admin-settlements.controller.js';
import { ClientSettlementsController } from './client-settlements.controller.js';
import { Settlement } from './entities/settlement.entity.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    IdempotencyModule,
    AuditModule,
    TransactionsModule,
    IdentityModule,
    TypeOrmModule.forFeature([Settlement]),
  ],
  controllers: [AdminSettlementsController, ClientSettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
