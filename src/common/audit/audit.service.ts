import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { AuditActor } from './audit.types.js';
import { AuditEntry } from './entities/audit-entry.entity.js';

@Injectable()
export class AuditService {
  appendChange(
    manager: EntityManager,
    actor: AuditActor | null,
    resource: string,
    resourceId: string,
    event: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    return this.append(
      manager,
      actor ?? {},
      resource,
      resourceId,
      event,
      { before, after },
      'sistema',
    );
  }

  async append(
    manager: EntityManager,
    actor: AuditActor,
    resource: string,
    resourceId: string | null,
    event: string,
    detail: unknown,
    systemActorType: 'system' | 'sistema' = 'system',
  ): Promise<void> {
    let actorType: string = systemActorType;
    if (actor.userId) actorType = 'usuario';
    if (actor.guestSessionId) actorType = 'sesion_cliente';
    await manager
      .getRepository(AuditEntry)
      .createQueryBuilder()
      .insert()
      .values([
        {
          actor_usuario_id: actor.userId ?? null,
          actor_sesion_cliente_id: actor.guestSessionId ?? null,
          actor_tipo: actorType,
          recurso_tipo: resource,
          recurso_id: resourceId,
          evento: event,
          detalle: () => ':value7::jsonb',
        },
      ])
      .setParameters({ value7: JSON.stringify(detail) })
      .execute();
  }
}
