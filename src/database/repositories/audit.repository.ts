import type { EntityManager } from 'typeorm';

export interface AuditActor {
  userId?: string;
  guestSessionId?: string;
}
export class AuditRepository {
  async append(
    manager: EntityManager,
    actor: AuditActor,
    resource: string,
    resourceId: string | null,
    event: string,
    detail: unknown,
    systemActorType: 'system' | 'sistema' = 'system',
  ): Promise<void> {
    await manager.query(
      `INSERT INTO auditoria(actor_usuario_id,actor_sesion_cliente_id,actor_tipo,recurso_tipo,recurso_id,evento,detalle)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        actor.userId ?? null,
        actor.guestSessionId ?? null,
        actor.guestSessionId
          ? 'sesion_cliente'
          : actor.userId
            ? 'usuario'
            : systemActorType,
        resource,
        resourceId,
        event,
        JSON.stringify(detail),
      ],
    );
  }
}
