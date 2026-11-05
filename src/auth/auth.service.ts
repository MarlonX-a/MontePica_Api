import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditRepository } from '../database/repositories/audit.repository.js';
import { AuthUserResponse } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Client } from './entities/client.entity.js';
import { Profile } from './entities/profile.entity.js';
import { User } from './entities/user.entity.js';
import {
  hashPassword,
  normalizeEmail,
  normalizePhone,
  verifyPassword,
} from './password.util.js';
import { IdentityRepository } from './repositories/identity.repository.js';
import { PermissionsRepository } from './repositories/permissions.repository.js';

const ACCESS_TOKEN_SECONDS = 900;
const REFRESH_SESSION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly identities: IdentityRepository = new IdentityRepository(),
    private readonly permissions: PermissionsRepository = new PermissionsRepository(),
    private readonly audit: AuditRepository = new AuditRepository(),
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = normalizeEmail(dto.email);
    const phone = normalizePhone(dto.phone);
    const passwordHash = await hashPassword(dto.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const role = await this.identities.findRoleByCode(manager, 'client');
        if (!role)
          throw new InternalServerErrorException(
            'Faltan los roles base. Ejecuta las migraciones.',
          );
        const user = await this.identities.createUser(manager, {
          normalizedEmail,
          passwordHash,
          active: true,
          accessVersion: 0,
          role,
        });
        const profile = await this.identities.createProfile(manager, {
          userId: user.id,
          names: dto.name.trim(),
          lastNames: null,
          phone,
        });
        const client = await this.identities.createClient(manager, {
          userId: user.id,
          contactName: dto.name.trim(),
          phone,
        });
        const session = await this.createSession(manager, user);
        return this.toAuthResponse(
          manager,
          user,
          profile,
          client,
          session.id,
          session.refreshToken,
        );
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (() => {
          const driverError = (
            error as QueryFailedError & {
              driverError?: { code?: string; constraint?: string };
            }
          ).driverError;
          return (
            driverError?.code === '23505' &&
            driverError.constraint === 'uq_usuario_correo_normalizado'
          );
        })()
      ) {
        throw new ConflictException('Ya existe una cuenta con ese correo.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const normalizedEmail = normalizeEmail(dto.email);
    return this.dataSource.transaction(async (manager) => {
      const user = await this.identities.lockUserByEmail(
        manager,
        normalizedEmail,
      );
      const passwordMatches = await verifyPassword(
        dto.password,
        user?.passwordHash,
      );
      if (!user || !user.active || !passwordMatches) {
        throw new UnauthorizedException('Correo o contraseña incorrectos.');
      }
      user.role = await this.identities.findUserRole(manager, user.id);
      const profile = await this.identities.findProfile(manager, user.id);
      const client = await this.identities.findClient(manager, user.id);
      const session = await this.createSession(manager, user);
      return this.toAuthResponse(
        manager,
        user,
        profile,
        client,
        session.id,
        session.refreshToken,
      );
    });
  }

  async refresh(refreshToken: string) {
    const oldHash = hashRefreshToken(refreshToken);
    const hint = await this.identities.findSessionByRefreshHash(
      this.dataSource.manager,
      oldHash,
    );
    if (!hint)
      throw new UnauthorizedException('Refresh token inválido o vencido.');
    return this.dataSource.transaction(async (manager) => {
      const user = await this.identities.lockActiveUser(manager, hint.userId);
      if (!user)
        throw new UnauthorizedException('Refresh token inválido o vencido.');
      user.role = await this.identities.findUserRole(manager, user.id);
      const session = await this.identities.lockRefreshSession(
        manager,
        oldHash,
      );
      if (!session)
        throw new UnauthorizedException('Refresh token inválido o vencido.');

      const profile = await this.identities.findProfile(manager, user.id);
      const client = await this.identities.findClient(manager, user.id);
      const replacement = randomBytes(32).toString('base64url');
      session.refreshHash = hashRefreshToken(replacement);
      session.generation += 1;
      await this.identities.saveSession(manager, session);
      return this.toAuthResponse(
        manager,
        user,
        profile,
        client,
        session.id,
        replacement,
      );
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.identities.revokeByRefreshHash(
        manager,
        hashRefreshToken(refreshToken),
      ),
    );
  }

  async getMe(userId: string): Promise<AuthUserResponse> {
    const user = await this.identities.findActiveUserWithRole(
      this.dataSource.manager,
      userId,
    );
    if (!user) throw new UnauthorizedException('Sesión no válida.');
    const profile = await this.identities.findProfile(
      this.dataSource.manager,
      userId,
    );
    const client = await this.identities.findClient(
      this.dataSource.manager,
      userId,
    );
    return this.toUserResponse(
      user,
      profile,
      client,
      await this.listPermissionCodes(this.dataSource.manager, user.role.id),
    );
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const encoded = await hashPassword(newPassword);
    await this.dataSource.transaction(async (manager) => {
      const user = await this.identities.lockUserWithPassword(manager, userId);
      if (
        !user ||
        !user.active ||
        !(await verifyPassword(currentPassword, user.passwordHash))
      ) {
        throw new UnauthorizedException('La contraseña actual no es correcta.');
      }
      user.passwordHash = encoded;
      user.accessVersion += 1;
      await this.identities.saveUser(manager, user);
      await this.identities.revokeUserSessions(manager, userId);
      await this.audit.append(
        manager,
        { userId },
        'usuario',
        userId,
        'auth.password_changed',
        {},
      );
    });
  }

  private async createSession(
    manager: import('typeorm').EntityManager,
    user: User,
  ) {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.identities.createSession(manager, {
      userId: user.id,
      refreshHash: hashRefreshToken(refreshToken),
      generation: 0,
      expiresAt: new Date(Date.now() + REFRESH_SESSION_MILLISECONDS),
      revokedAt: null,
    });
    return { ...session, refreshToken };
  }

  private async toAuthResponse(
    manager: import('typeorm').EntityManager,
    user: User,
    profile: Profile,
    client: Client | null,
    sessionId: string,
    refreshToken: string,
  ) {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, sid: sessionId, av: user.accessVersion },
      {
        algorithm: 'HS256',
        issuer: 'montepica-api',
        audience: 'montepica-app',
      },
    );
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn: ACCESS_TOKEN_SECONDS,
      user: this.toUserResponse(
        user,
        profile,
        client,
        await this.listPermissionCodes(manager, user.role.id),
      ),
    };
  }

  private toUserResponse(
    user: User,
    profile: Profile,
    client: Client | null,
    permissions: string[],
  ): AuthUserResponse {
    return {
      id: user.id,
      name: profile.names,
      email: user.normalizedEmail,
      phone: profile.phone ?? client?.phone ?? '',
      role: { code: user.role.code, name: user.role.name },
      clientId: client?.id ?? null,
      permissions,
    };
  }

  private async listPermissionCodes(
    manager: import('typeorm').EntityManager,
    roleId: string,
  ): Promise<string[]> {
    return this.permissions.forRole(manager, roleId);
  }
}
