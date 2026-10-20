import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { randomBytes, createHash } from 'node:crypto';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { User } from './entities/user.entity.js';
import { Role } from './entities/role.entity.js';
import { Profile } from './entities/profile.entity.js';
import { Client } from './entities/client.entity.js';
import { UserSession } from './entities/user-session.entity.js';
import { AuthUserResponse } from './auth.types.js';
import { hashPassword, normalizeEmail, normalizePhone, verifyPassword } from './password.util.js';

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
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = normalizeEmail(dto.email);
    const phone = normalizePhone(dto.phone);
    const passwordHash = await hashPassword(dto.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const roles = manager.getRepository(Role);
        const users = manager.getRepository(User);
        const profiles = manager.getRepository(Profile);
        const clients = manager.getRepository(Client);
        const sessions = manager.getRepository(UserSession);
        const role = await roles.findOneBy({ code: 'client' });
        if (!role) throw new InternalServerErrorException('Faltan los roles base. Ejecuta las migraciones.');
        const user = await users.save(users.create({
          normalizedEmail,
          passwordHash,
          active: true,
          accessVersion: 0,
          role,
        }));
        const profile = await profiles.save(profiles.create({
          userId: user.id,
          names: dto.name.trim(),
          lastNames: null,
          phone,
        }));
        const client = await clients.save(clients.create({
          userId: user.id,
          contactName: dto.name.trim(),
          phone,
        }));
        const session = await this.createSession(sessions, user);
        return this.toAuthResponse(manager, user, profile, client, session.id, session.refreshToken);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (() => {
          const driverError = (error as QueryFailedError & {
            driverError?: { code?: string; constraint?: string };
          }).driverError;
          return driverError?.code === '23505' &&
            driverError.constraint === 'uq_usuario_correo_normalizado';
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
      const user = await manager.getRepository(User).createQueryBuilder('user')
        .addSelect('user.passwordHash').setLock('pessimistic_write')
        .where('user.normalizedEmail = :normalizedEmail', { normalizedEmail }).getOne();
      const passwordMatches = await verifyPassword(dto.password, user?.passwordHash);
      if (!user || !user.active || !passwordMatches) {
        throw new UnauthorizedException('Correo o contraseña incorrectos.');
      }
      const roleRow = await manager.query('SELECT id_rol FROM usuario WHERE id_usuario=$1', [user.id]);
      user.role = await manager.getRepository(Role).findOneByOrFail({ id: roleRow[0].id_rol });
      const profiles = manager.getRepository(Profile);
      const clients = manager.getRepository(Client);
      const sessions = manager.getRepository(UserSession);
      const profile = await profiles.findOneByOrFail({ userId: user.id });
      const client = await clients.findOneBy({ userId: user.id });
      const session = await this.createSession(sessions, user);
      return this.toAuthResponse(manager, user, profile, client, session.id, session.refreshToken);
    });
  }

  async refresh(refreshToken: string) {
    const oldHash = hashRefreshToken(refreshToken);
    const hint = await this.dataSource.getRepository(UserSession).findOneBy({ refreshHash: oldHash });
    if (!hint) throw new UnauthorizedException('Refresh token inválido o vencido.');
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId: hint.userId }).andWhere('user.active = true').getOne();
      if (!user) throw new UnauthorizedException('Refresh token inválido o vencido.');
      const roleRow = await manager.query('SELECT id_rol FROM usuario WHERE id_usuario=$1', [user.id]);
      user.role = await manager.getRepository(Role).findOneByOrFail({ id: roleRow[0].id_rol });
      const sessions = manager.getRepository(UserSession);
      const session = await sessions
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.refreshHash = :oldHash', { oldHash })
        .andWhere('session.revokedAt IS NULL')
        .andWhere('session.expiresAt > :now', { now: new Date() })
        .getOne();
      if (!session) throw new UnauthorizedException('Refresh token inválido o vencido.');

      const profile = await manager.getRepository(Profile).findOneByOrFail({ userId: user.id });
      const client = await manager.getRepository(Client).findOneBy({ userId: user.id });
      const replacement = randomBytes(32).toString('base64url');
      session.refreshHash = hashRefreshToken(replacement);
      session.generation += 1;
      await sessions.save(session);
      return this.toAuthResponse(manager, user, profile, client, session.id, replacement);
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.dataSource.getRepository(UserSession)
      .createQueryBuilder()
      .update(UserSession)
      .set({ revokedAt: new Date() })
      .where('refreshHash = :refreshHash', { refreshHash: hashRefreshToken(refreshToken) })
      .andWhere('revokedAt IS NULL')
      .execute();
  }

  async getMe(userId: string): Promise<AuthUserResponse> {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId, active: true },
      relations: { role: true },
    });
    if (!user) throw new UnauthorizedException('Sesión no válida.');
    const profile = await this.dataSource.getRepository(Profile).findOneByOrFail({ userId });
    const client = await this.dataSource.getRepository(Client).findOneBy({ userId });
    return this.toUserResponse(user, profile, client, await this.listPermissionCodes(this.dataSource.manager, user.role.id));
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const encoded = await hashPassword(newPassword);
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).createQueryBuilder('user').addSelect('user.passwordHash')
        .setLock('pessimistic_write').where('user.id = :userId', { userId }).getOne();
      if (!user || !user.active || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new UnauthorizedException('La contraseña actual no es correcta.');
      }
      user.passwordHash = encoded;
      user.accessVersion += 1;
      await manager.getRepository(User).save(user);
      await manager.getRepository(UserSession).createQueryBuilder().update(UserSession)
        .set({ revokedAt: new Date() }).where('userId = :userId', { userId }).andWhere('revokedAt IS NULL').execute();
      await manager.query(`INSERT INTO auditoria(actor_usuario_id,actor_tipo,recurso_tipo,recurso_id,evento,detalle)
        VALUES($1,'usuario','usuario',$1,'auth.password_changed','{}'::jsonb)`, [userId]);
    });
  }

  private async createSession(repository: Repository<UserSession>, user: User) {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await repository.save(repository.create({
      userId: user.id,
      refreshHash: hashRefreshToken(refreshToken),
      generation: 0,
      expiresAt: new Date(Date.now() + REFRESH_SESSION_MILLISECONDS),
      revokedAt: null,
    }));
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
      { algorithm: 'HS256', issuer: 'montepica-api', audience: 'montepica-app' },
    );
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn: ACCESS_TOKEN_SECONDS,
      user: this.toUserResponse(user, profile, client, await this.listPermissionCodes(manager, user.role.id)),
    };
  }

  private toUserResponse(user: User, profile: Profile, client: Client | null, permissions: string[]): AuthUserResponse {
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

  private async listPermissionCodes(manager: import('typeorm').EntityManager, roleId: string): Promise<string[]> {
    const rows: { codigo: string }[] = await manager.query(`SELECT p.codigo FROM permiso p
      JOIN rol_permiso rp ON rp.id_permiso=p.id_permiso WHERE rp.id_rol=$1 ORDER BY p.codigo`, [roleId]);
    return rows.map((row) => row.codigo);
  }
}
