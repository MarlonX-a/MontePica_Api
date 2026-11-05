import type { EntityManager } from 'typeorm';
import { AuditRepository } from '../database/repositories/audit.repository.js';

export interface TableActor {
  userId?: string;
  guestSessionId?: string;
}

export async function auditTableOperation(
  manager: EntityManager,
  actor: TableActor,
  resource: string,
  resourceId: string,
  event: string,
  detail: unknown,
): Promise<void> {
  await new AuditRepository().append(
    manager,
    actor,
    resource,
    resourceId,
    event,
    detail,
  );
}
