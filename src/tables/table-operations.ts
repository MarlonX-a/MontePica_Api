import { ConflictException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

// Same advisory lock as operations and inventory. Order: settings, day, table, visit.
export async function lockTableOperations(manager: EntityManager): Promise<string> {
  await manager.query('SELECT pg_advisory_xact_lock(71920405)');
  const [settings] = await manager.query(`SELECT "zona_horaria" AS "timeZone" FROM "configuracion_operativa" WHERE "id_configuracion"=1 FOR UPDATE`);
  if (!settings) throw new ConflictException('Configuración operativa no disponible.');
  return settings.timeZone;
}

export async function lockActiveVisit(manager: EntityManager, visitId: string, timeZone: string) {
  const [ref] = await manager.query(`SELECT "id_mesa" AS "tableId","id_jornada" AS "dayId" FROM "visita_mesa" WHERE "id_visita"=$1`, [visitId]);
  if (!ref) throw new NotFoundException('Visita no encontrada.');
  const [day] = await manager.query(`SELECT "estado" AS status FROM "jornada_operativa" WHERE "id_jornada"=$1 FOR UPDATE`, [ref.dayId]);
  const [table] = await manager.query(`SELECT "id_mesa" AS id,"codigo" AS code,"activa" AS active,"qr_version" AS "qrVersion","qr_hash" AS "qrHash" FROM "mesa" WHERE "id_mesa"=$1 FOR UPDATE`, [ref.tableId]);
  const [visit] = await manager.query(`SELECT "estado" AS status FROM "visita_mesa" WHERE "id_visita"=$1 FOR UPDATE`, [visitId]);
  const [{ current }] = await manager.query(`SELECT "fecha_operativa"=timezone($2,clock_timestamp())::date AS current FROM "jornada_operativa" WHERE "id_jornada"=$1`, [ref.dayId, timeZone]);
  if (visit.status !== 'open' || !table.active || day.status !== 'open' || !current) {
    throw new ConflictException('La visita requiere mesa activa y jornada abierta de la fecha operativa actual.');
  }
  return table as { id: string; code: string; active: boolean; qrVersion: number; qrHash: string | null };
}
