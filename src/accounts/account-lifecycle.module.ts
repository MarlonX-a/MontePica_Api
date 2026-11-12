import { Module } from '@nestjs/common';
import { AccountLifecycleService } from './account-lifecycle.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [AccountLifecycleService],
  exports: [AccountLifecycleService],
})
export class AccountLifecycleModule {}
