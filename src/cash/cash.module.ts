import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { RedemptionReservationsModule } from '../redemptions/redemption-reservations.module.js';
import { CashController } from './cash.controller.js';
import { CashService } from './cash.service.js';
import { CashRegister } from './entities/cash-register.entity.js';

@Module({
  imports: [
    AuthModule,
    IdempotencyModule,
    RedemptionReservationsModule,
    AuditModule,
    TransactionsModule,
    OperationsModule,
    IdentityModule,
    TypeOrmModule.forFeature([CashRegister]),
  ],
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}
