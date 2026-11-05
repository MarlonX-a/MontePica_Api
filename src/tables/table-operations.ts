import { ConflictException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OperationalLockRepository } from '../database/repositories/operational-lock.repository.js';

const locks = new OperationalLockRepository();

// Same advisory lock as operations and inventory. Order: settings, day, table, visit.
export async function lockTableOperations(
  manager: EntityManager,
): Promise<string> {
  await locks.acquire(manager);
  const settings = await locks.lockSettings(manager);
  if (!settings)
    throw new ConflictException('Configuración operativa no disponible.');
  return settings.timeZone;
}

export async function lockActiveVisit(
  manager: EntityManager,
  visitId: string,
  timeZone: string,
) {
  const ref = await locks.findVisitReference(manager, visitId);
  if (!ref) throw new NotFoundException('Visita no encontrada.');
  const day = await locks.lockDay(manager, ref.dayId);
  const table = await locks.lockTable(manager, ref.tableId);
  const visit = await locks.lockVisit(manager, visitId);
  const current = await locks.isCurrentDay(manager, ref.dayId, timeZone);
  if (
    visit.status !== 'open' ||
    !table.active ||
    day.status !== 'open' ||
    !current
  ) {
    throw new ConflictException(
      'La visita requiere mesa activa y jornada abierta de la fecha operativa actual.',
    );
  }
  return table;
}
