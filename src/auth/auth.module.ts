import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../common/audit/audit.module.js';
import { IdentityModule } from '../common/identity/identity.module.js';
import { PasswordRecoveryStore } from '../database/password-recovery.store.js';
import { User } from '../users/entities/user.entity.js';
import { AccessIdentityService } from './access-identity.service.js';
import { AuthAccessGuard } from './auth-access.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PermissionsGuard } from './permissions.guard.js';
import { PasswordRecoveryMailer } from './password-recovery-mailer.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import { PasswordRecoveryWorker } from './password-recovery.worker.js';

@Module({
  imports: [
    IdentityModule,
    AuditModule,
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          algorithm: 'HS256' as const,
          issuer: 'montepica-api',
          audience: 'montepica-app',
          expiresIn: 900,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordRecoveryMailer,
    PasswordRecoveryStore,
    PasswordRecoveryService,
    PasswordRecoveryWorker,
    AccessIdentityService,
    AuthAccessGuard,
    AuthService,
    PermissionsGuard,
  ],
  exports: [
    AccessIdentityService,
    AuthAccessGuard,
    AuthService,
    PermissionsGuard,
    JwtModule,
  ],
})
export class AuthModule {}
