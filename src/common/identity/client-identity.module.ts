import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { GuestSessionsModule } from '../../guest-sessions/guest-sessions.module.js';
import { ClientAccessGuard } from './client-access.guard.js';
import { RegisteredClientGuard } from './registered-client.guard.js';

@Module({
  imports: [GuestSessionsModule, AuthModule],
  controllers: [],
  providers: [ClientAccessGuard, RegisteredClientGuard],
  exports: [
    ClientAccessGuard,
    RegisteredClientGuard,
    GuestSessionsModule,
    AuthModule,
  ],
})
export class ClientIdentityModule {}
