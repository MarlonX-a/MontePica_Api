import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { type AuditActor } from '../audit/audit.types.js';
import { TransactionLocksService } from '../transactions/transaction-locks.service.js';
import { IdempotencyRecord } from './entities/idempotency-record.entity.js';
import { IdempotencyIdentity } from './idempotency.types.js';

@Injectable()
export class IdempotencyRecordsService {
  constructor(private readonly locks: TransactionLocksService) {}

  async acquire(
    manager: EntityManager,
    id: IdempotencyIdentity,
  ): Promise<void> {
    await this.locks.acquireIdempotency(
      manager,
      `${id.actorType}:${id.identity}:${id.operation}:${id.key}`,
    );
  }

  async find<T>(
    manager: EntityManager,
    id: IdempotencyIdentity,
  ): Promise<{ hash: string; response: T } | undefined> {
    const [row] = await manager
      .getRepository(IdempotencyRecord)
      .createQueryBuilder('idempotencia')
      .select(['solicitud_hash AS hash', 'respuesta AS response'])
      .where(
        "actor_tipo=:actorType AND operacion=:operation AND clave=:key AND ((:actorType='usuario' AND actor_usuario_id=:identity) OR (:actorType='sesion_cliente' AND actor_sesion_cliente_id=:identity))",
      )
      .setParameters({
        actorType: id.actorType,
        operation: id.operation,
        key: id.key,
        identity: id.identity,
      })
      .getRawMany();
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
    await manager
      .getRepository(IdempotencyRecord)
      .createQueryBuilder()
      .insert()
      .values([
        {
          actor_usuario_id: actor.userId ?? null,
          actor_sesion_cliente_id: actor.guestSessionId ?? null,
          actor_tipo: id.actorType,
          operacion: id.operation,
          clave: id.key,
          solicitud_hash: hash,
          estado_http: status,
          respuesta: () => ':response::jsonb',
          recurso_tipo: resourceType,
          recurso_id: resourceId,
        },
      ])
      .setParameters({ response: JSON.stringify(response) })
      .execute();
  }
}
