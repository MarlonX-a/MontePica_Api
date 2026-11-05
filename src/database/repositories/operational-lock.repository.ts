import type { EntityManager } from 'typeorm';

export interface LockedTable {
  id: string;
  code: string;
  active: boolean;
  qrVersion: number;
  qrHash: string | null;
}
export class OperationalLockRepository {
  async acquireAdministratorMembership(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(71920403)');
  }
  async acquire(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(71920405)');
  }
  async lockSettings(
    manager: EntityManager,
  ): Promise<{ timeZone: string } | undefined> {
    const [row] = await manager.query<Array<{ timeZone: string }>>(
      `SELECT zona_horaria AS "timeZone" FROM configuracion_operativa WHERE id_configuracion=1 FOR UPDATE`,
    );
    return row;
  }
  async findVisitReference(
    manager: EntityManager,
    visitId: string,
  ): Promise<{ tableId: string; dayId: string } | undefined> {
    const [row] = await manager.query<
      Array<{ tableId: string; dayId: string }>
    >(
      `SELECT id_mesa AS "tableId",id_jornada AS "dayId" FROM visita_mesa WHERE id_visita=$1`,
      [visitId],
    );
    return row;
  }
  async lockDay(
    manager: EntityManager,
    dayId: string,
  ): Promise<{ status: string }> {
    const [row] = await manager.query<Array<{ status: string }>>(
      'SELECT estado AS status FROM jornada_operativa WHERE id_jornada=$1 FOR UPDATE',
      [dayId],
    );
    return row;
  }
  async lockTable(
    manager: EntityManager,
    tableId: string,
  ): Promise<LockedTable> {
    const [row] = await manager.query<LockedTable[]>(
      `SELECT id_mesa AS id,codigo AS code,activa AS active,qr_version AS "qrVersion",qr_hash AS "qrHash" FROM mesa WHERE id_mesa=$1 FOR UPDATE`,
      [tableId],
    );
    return row;
  }
  async lockVisit(
    manager: EntityManager,
    visitId: string,
  ): Promise<{ status: string }> {
    const [row] = await manager.query<Array<{ status: string }>>(
      'SELECT estado AS status FROM visita_mesa WHERE id_visita=$1 FOR UPDATE',
      [visitId],
    );
    return row;
  }
  async isCurrentDay(
    manager: EntityManager,
    dayId: string,
    timeZone: string,
  ): Promise<boolean> {
    const [row] = await manager.query<Array<{ current: boolean }>>(
      `SELECT fecha_operativa=timezone($2,clock_timestamp())::date AS current FROM jornada_operativa WHERE id_jornada=$1`,
      [dayId, timeZone],
    );
    return row.current;
  }
}
