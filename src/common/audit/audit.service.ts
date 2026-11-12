import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { AuditActor } from './audit.types.js';
import { AuditEntry } from './entities/audit-entry.entity.js';

@Injectable()
export class AuditService {
  async append(
    manager: EntityManager,
    actor: AuditActor,
    resource: string,
    resourceId: string | null,
    event: string,
    detail: unknown,
    systemActorType: 'system' | 'sistema' = 'system',
  ): Promise<void> {
    await manager
      .getRepository(AuditEntry)
      .createQueryBuilder()
      .insert()
      .values([
        {
          actor_usuario_id: actor.userId ?? null,
          actor_sesion_cliente_id: actor.guestSessionId ?? null,
          actor_tipo: actor.guestSessionId
            ? 'sesion_cliente'
            : actor.userId
              ? 'usuario'
              : systemActorType,
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
