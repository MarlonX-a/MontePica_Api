import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity.js';
import { Profile } from './entities/profile.entity.js';
import { Role } from './entities/role.entity.js';
import { User } from './entities/user.entity.js';
import { UserSession } from './entities/user-session.entity.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthAccessGuard } from './auth-access.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, Profile, Role, User, UserSession]),
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
  providers: [AuthService, AuthAccessGuard, PermissionsGuard],
  exports: [AuthAccessGuard, PermissionsGuard, JwtModule],
})
export class AuthModule {}
