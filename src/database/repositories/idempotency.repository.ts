import type { EntityManager } from 'typeorm';
import type { AuditActor } from './audit.repository.js';

export interface IdempotencyIdentity {
  actorType: 'usuario' | 'sesion_cliente';
  identity: string;
  operation: string;
  key: string;
}
export class IdempotencyRepository {
  async acquire(
    manager: EntityManager,
    id: IdempotencyIdentity,
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 71920405))',
      [`${id.actorType}:${id.identity}:${id.operation}:${id.key}`],
    );
  }
  async find<T>(
    manager: EntityManager,
    id: IdempotencyIdentity,
  ): Promise<{ hash: string; response: T } | undefined> {
    const [row] = await manager.query<Array<{ hash: string; response: T }>>(
      `SELECT solicitud_hash AS hash,respuesta AS response FROM idempotencia
      WHERE actor_tipo=$1 AND operacion=$2 AND clave=$3 AND (($1='usuario' AND actor_usuario_id=$4) OR ($1='sesion_cliente' AND actor_sesion_cliente_id=$4))`,
      [id.actorType, id.operation, id.key, id.identity],
    );
    return row;
  }
  async save(
    manager: EntityManager,
    actor: AuditActor,
    id: IdempotencyIdentity,
    hash: string,
    status: number,
    response: unknown,
    resourceType: string,
    resourceId: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO idempotencia(actor_usuario_id,actor_sesion_cliente_id,actor_tipo,operacion,clave,solicitud_hash,estado_http,respuesta,recurso_tipo,recurso_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        actor.userId ?? null,
        actor.guestSessionId ?? null,
        id.actorType,
        id.operation,
        id.key,
        hash,
        status,
        JSON.stringify(response),
        resourceType,
        resourceId,
      ],
    );
  }
}
