import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { TableActor } from './table-audit.js';

/** Persists an operation and its response in the same transaction as its side effects. */
@Injectable()
export class ParticipationIdempotencyService {
  constructor(private readonly db: DataSource) {}

  async run<T>(actor: TableActor, operation: string, key: string | undefined, request: unknown,
    status: number, resourceType: string, authorize: (manager: EntityManager) => Promise<void>,
    action: (manager: EntityManager) => Promise<{ resourceId: string; response: T }>): Promise<T> {
    if (!key || key.length > 128 || key.trim() !== key) throw new BadRequestException('Envía Idempotency-Key con entre 1 y 128 caracteres, sin espacios externos.');
    const identity = actor.guestSessionId ?? actor.userId;
    if (!identity || (!!actor.guestSessionId === !!actor.userId)) throw new BadRequestException('Identidad de operación inválida.');
    const actorType = actor.guestSessionId ? 'sesion_cliente' : 'usuario';
    const hash = createHash('sha256').update(this.canonicalJson(request)).digest('hex');
    return this.db.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 71920405))', [`${actorType}:${identity}:${operation}:${key}`]);
      await authorize(manager);
      const [saved] = await manager.query(`SELECT "solicitud_hash" AS hash, "respuesta" AS response FROM "idempotencia"
        WHERE "actor_tipo"=$1 AND "operacion"=$2 AND "clave"=$3 AND
          (($1='usuario' AND "actor_usuario_id"=$4) OR ($1='sesion_cliente' AND "actor_sesion_cliente_id"=$4))`,
      [actorType, operation, key, identity]);
      if (saved) {
        if (saved.hash !== hash) throw new ConflictException('Idempotency-Key ya fue usada con otro contenido.');
        return saved.response as T;
      }
      const result = await action(manager);
      await manager.query(`INSERT INTO "idempotencia" ("actor_usuario_id","actor_sesion_cliente_id","actor_tipo",
        "operacion","clave","solicitud_hash","estado_http","respuesta","recurso_tipo","recurso_id")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [actor.userId ?? null, actor.guestSessionId ?? null, actorType, operation, key, hash, status,
        JSON.stringify(result.response), resourceType, result.resourceId]);
      return result.response;
    });
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(item => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const items = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, 'en'));
      return `{${items.map(([key, item]) => JSON.stringify(key) + ':' + this.canonicalJson(item)).join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
