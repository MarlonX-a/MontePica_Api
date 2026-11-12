import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { TransactionLocksService } from './transaction-locks.service.js';

@Injectable()
export class OperationalContextService {
  constructor(private readonly locks: TransactionLocksService) {}

  // Same advisory lock as operations and inventory. Order: settings, day, table, visit.
  async lockTableOperations(manager: EntityManager): Promise<string> {
    await this.locks.acquire(manager);
    const settings = await this.locks.lockSettings(manager);
    if (!settings)
      throw new ConflictException('Configuración operativa no disponible.');
    return settings.timeZone;
  }

  async lockActiveVisit(
    manager: EntityManager,
    visitId: string,
    timeZone: string,
  ) {
    const ref = await this.locks.findVisitReference(manager, visitId);
    if (!ref) throw new NotFoundException('Visita no encontrada.');
    const day = await this.locks.lockDay(manager, ref.dayId);
    const table = await this.locks.lockTable(manager, ref.tableId);
    const visit = await this.locks.lockVisit(manager, visitId);
    const current = await this.locks.isCurrentDay(manager, ref.dayId, timeZone);
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
}
