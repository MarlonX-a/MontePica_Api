import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { IdentityService } from '../common/identity/identity.service.js';
import {
  PasswordRecoveryStore,
  type RecoveryJob,
} from '../database/password-recovery.store.js';
import { PasswordRecoveryMailer } from './password-recovery-mailer.js';

const MAX_ATTEMPTS = 3;

@Injectable()
export class PasswordRecoveryWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PasswordRecoveryWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly identities: IdentityService,
    private readonly mailer: PasswordRecoveryMailer,
    private readonly store: PasswordRecoveryStore,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.get<boolean>('PASSWORD_RECOVERY_ENABLED', false)) return;
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 5_000);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }

  private tick() {
    this.running ??= this.processPending()
      .catch(() =>
        this.logger.error(
          'Falló el procesamiento de recuperación. Se reintentará.',
        ),
      )
      .finally(() => {
        this.running = undefined;
      });
  }

  async processPending(): Promise<void> {
    await this.store.clean(this.db.manager, MAX_ATTEMPTS);
    for (let index = 0; index < 20 && !this.stopping; index += 1) {
      const result = await this.db.transaction((manager) =>
        this.claim(manager),
      );
      if (!result) return;
      if (result.token) await this.deliver(result.job, result.token);
    }
  }

  private async claim(manager: EntityManager) {
    const job = await this.store.claim(manager, MAX_ATTEMPTS);
    if (!job) return;
    const token = await this.issueToken(manager, job);
    if (token) {
      job.intentos += 1;
      await this.store.lease(manager, job);
    } else {
      await this.store.remove(manager, job);
    }
    return { job, token };
  }

  private async issueToken(manager: EntityManager, job: RecoveryJob) {
    if (!job.id_usuario) return;
    const user = await this.identities.lockActiveUser(manager, job.id_usuario);
    if (
      user?.accessVersion !== job.version_acceso ||
      user?.normalizedEmail !== job.correo
    )
      return;
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const issued = await this.store.issue(manager, job, hash);
    if (issued) return token;
  }

  private async deliver(job: RecoveryJob, token: string) {
    try {
      await this.mailer.send(job.correo, token);
    } catch {
      this.logger.warn('SMTP no confirmó un correo de recuperación.');
      await this.store.retry(this.db.manager, job);
      return;
    }
    await this.store.remove(this.db.manager, job);
  }
}
