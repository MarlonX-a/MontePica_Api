import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ClientIdentityModule } from '../common/identity/client-identity.module.js';
import { AccountsService } from './accounts.service.js';
import { AdminAccountsController } from './admin-accounts.controller.js';
import { ClientAccountsController } from './client-accounts.controller.js';
import { ConsumptionAccount } from './entities/consumption-account.entity.js';

@Module({
  imports: [
    AuthModule,
    ClientIdentityModule,
    TypeOrmModule.forFeature([ConsumptionAccount]),
  ],
  controllers: [AdminAccountsController, ClientAccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
