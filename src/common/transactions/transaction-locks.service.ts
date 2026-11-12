import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { OperatingDay } from '../../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../../operations/entities/operations-settings.entity.js';
import { RestaurantTable } from '../../tables/entities/restaurant-table.entity.js';
import { TableVisit } from '../../visits/entities/table-visit.entity.js';
import { LockedTable } from './operational-lock.types.js';

@Injectable()
export class TransactionLocksService {
  async acquireAdministratorMembership(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(71920403)');
  }

  async acquire(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(71920405)');
  }

  async lockSettings(
    manager: EntityManager,
  ): Promise<{ timeZone: string } | undefined> {
    const [row] = await manager
      .getRepository(OperationsSettings)
      .createQueryBuilder('configuracion_operativa')
      .select('zona_horaria AS "timeZone"')
      .where('id_configuracion=1')
      .setLock('pessimistic_write', undefined, undefined)
      .getRawMany();
    return row;
  }

  async findVisitReference(
    manager: EntityManager,
    visitId: string,
  ): Promise<{ tableId: string; dayId: string } | undefined> {
    const [row] = await manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select(['id_mesa AS "tableId"', 'id_jornada AS "dayId"'])
      .where('id_visita=:visitId')
      .setParameters({ visitId })
      .getRawMany();
    return row;
  }

  async lockDay(
    manager: EntityManager,
    dayId: string,
  ): Promise<{ status: string }> {
    const [row] = await manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('estado AS status')
      .where('id_jornada=:dayId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ dayId })
      .getRawMany();
    return row;
  }

  async lockTable(
    manager: EntityManager,
    tableId: string,
  ): Promise<LockedTable> {
    const [row] = await manager
      .getRepository(RestaurantTable)
      .createQueryBuilder('mesa')
      .select([
        'id_mesa AS id',
        'codigo AS code',
        'activa AS active',
        'qr_version AS "qrVersion"',
        'qr_hash AS "qrHash"',
      ])
      .where('id_mesa=:tableId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ tableId })
      .getRawMany();
    return row;
  }

  async lockVisit(
    manager: EntityManager,
    visitId: string,
  ): Promise<{ status: string }> {
    const [row] = await manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select('estado AS status')
      .where('id_visita=:visitId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ visitId })
      .getRawMany();
    return row;
  }

  async isCurrentDay(
    manager: EntityManager,
    dayId: string,
    timeZone: string,
  ): Promise<boolean> {
    const [row] = await manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select(
        'fecha_operativa=timezone(:timeZone,clock_timestamp())::date AS current',
      )
      .where('id_jornada=:dayId')
      .setParameters({ dayId, timeZone })
      .getRawMany();
    return row.current;
  }

  async acquireIdempotency(manager: EntityManager, key: string): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 71920405))',
      [key],
    );
  }
}
