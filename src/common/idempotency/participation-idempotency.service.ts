import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { type TableActor } from '../audit/table-audit.js';
import { IdempotencyRecordsService } from './idempotency-records.service.js';
import { type IdempotencyIdentity } from './idempotency.types.js';

/** Persists an operation and its response in the same transaction as its side effects. */
@Injectable()
export class ParticipationIdempotencyService {
  constructor(
    private readonly db: DataSource,
    private readonly records: IdempotencyRecordsService,
  ) {}

  async run<T>(
    actor: TableActor,
    operation: string,
    key: string | undefined,
    request: unknown,
    status: number,
    resourceType: string,
    authorize: (manager: EntityManager) => Promise<void>,
    action: (
      manager: EntityManager,
    ) => Promise<{ resourceId: string; response: T }>,
  ): Promise<T> {
    if (!key || key.length > 128 || key.trim() !== key)
      throw new BadRequestException(
        'Envía Idempotency-Key con entre 1 y 128 caracteres, sin espacios externos.',
      );
    const identity = actor.guestSessionId ?? actor.userId;
    if (!identity || !!actor.guestSessionId === !!actor.userId)
      throw new BadRequestException('Identidad de operación inválida.');
    const actorType = actor.guestSessionId ? 'sesion_cliente' : 'usuario';
    const hash = createHash('sha256')
      .update(this.canonicalJson(request))
      .digest('hex');
    return this.db.transaction(async (manager) => {
      const id: IdempotencyIdentity = { actorType, identity, operation, key };
      await this.records.acquire(manager, id);
      await authorize(manager);
      const saved = await this.records.find<T>(manager, id);
      if (saved) {
        if (saved.hash !== hash)
          throw new ConflictException(
            'Idempotency-Key ya fue usada con otro contenido.',
          );
        return saved.response as T;
      }
      const result = await action(manager);
      await this.records.save(
        manager,
        actor,
        id,
        hash,
        status,
        result.response,
        resourceType,
        result.resourceId,
      );
      return result.response;
    });
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const items = Object.entries(value as Record<string, unknown>).sort(
        ([a], [b]) => a.localeCompare(b, 'en'),
      );
      return `{${items.map(([key, item]) => JSON.stringify(key) + ':' + this.canonicalJson(item)).join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
