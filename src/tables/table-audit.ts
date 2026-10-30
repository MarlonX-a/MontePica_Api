import type { EntityManager } from 'typeorm';

export interface TableActor { userId?: string; guestSessionId?: string }

export async function auditTableOperation(manager: EntityManager, actor: TableActor, resource: string,
  resourceId: string, event: string, detail: unknown): Promise<void> {
  await manager.query(`INSERT INTO "auditoria"
    ("actor_usuario_id","actor_sesion_cliente_id","actor_tipo","recurso_tipo","recurso_id","evento","detalle")
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
  [actor.userId ?? null, actor.guestSessionId ?? null, actor.guestSessionId ? 'sesion_cliente' : 'usuario',
    resource, resourceId, event, JSON.stringify(detail)]);
}
