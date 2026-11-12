import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { TransactionsModule } from '../common/transactions/transactions.module.js';
import { PointsMovement } from './entities/points-movement.entity.js';
import { PointsController } from './points.controller.js';
import { PointsService } from './points.service.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    IdempotencyModule,
    AuditModule,
    TransactionsModule,
    IdentityModule,
    TypeOrmModule.forFeature([PointsMovement]),
  ],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
