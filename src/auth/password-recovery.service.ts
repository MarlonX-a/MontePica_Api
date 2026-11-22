import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../common/audit/audit.service.js';
import { IdentityService } from '../common/identity/identity.service.js';
import { PasswordRecoveryStore } from '../database/password-recovery.store.js';
import { hashPassword, normalizeEmail } from './password.util.js';

export const RECOVERY_LIMITS = { ip: 20, email: 3, reset: 20 };

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function invalidToken(): BadRequestException {
  return new BadRequestException('El código de recuperación no es válido.');
}

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly identities: IdentityService,
    private readonly audit: AuditService,
    private readonly store: PasswordRecoveryStore,
  ) {}

  async request(email: string, ip: string): Promise<void> {
    this.ensureEnabled();
    const normalized = normalizeEmail(email);
    await this.db.transaction(async (manager) => {
      if (!(await this.allow(manager, 'forgot-ip', ip, RECOVERY_LIMITS.ip)))
        return;
      if (
        !(await this.allow(
          manager,
          'forgot-email',
          normalized,
          RECOVERY_LIMITS.email,
        ))
      )
        return;
      await this.store.enqueue(manager, normalized);
    });
  }

  async reset(token: string, newPassword: string, ip: string): Promise<void> {
    this.ensureEnabled();
    if (
      !(await this.allow(
        this.db.manager,
        'reset-ip',
        ip,
        RECOVERY_LIMITS.reset,
      ))
    ) {
      throw new HttpException(
        'Demasiados intentos. Intenta más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const hash = digest(token);
    const candidate = await this.store.candidate(this.db.manager, hash);
    if (!candidate) throw invalidToken();

    const encoded = await hashPassword(newPassword);
    await this.db.transaction(async (manager) => {
      const user = await this.identities.lockActiveUser(manager, candidate);
      if (!user) throw invalidToken();
      const consumed = await this.store.consume(
        manager,
        user.id,
        hash,
        user.accessVersion,
      );
      if (!consumed) throw invalidToken();
      user.passwordHash = encoded;
      user.accessVersion += 1;
      await this.identities.saveUser(manager, user);
      await this.identities.revokeUserSessions(manager, user.id);
      await this.audit.append(
        manager,
        { userId: user.id },
        'usuario',
        user.id,
        'auth.password_reset',
        {},
      );
    });
  }

  private ensureEnabled(): void {
    if (!this.config.get<boolean>('PASSWORD_RECOVERY_ENABLED', false)) {
      throw new ServiceUnavailableException(
        'La recuperación por correo no está disponible.',
      );
    }
  }

  private allow(
    manager: EntityManager,
    scope: string,
    value: string,
    limit: number,
  ): Promise<boolean> {
    return this.store.allow(manager, `${scope}:${digest(value)}`, limit);
  }
}
