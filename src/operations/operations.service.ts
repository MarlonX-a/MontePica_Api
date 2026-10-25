import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto.js';
import { UpdateOperationsSettingsDto } from './dto/update-operations-settings.dto.js';

type SettingsRow = {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  updatedAt: Date;
};

@Injectable()
export class OperationsService {
  constructor(private readonly dataSource: DataSource) {}

  async getSettings() {
    const rows = await this.dataSource.query(
      `SELECT "id_configuracion" AS id, "zona_horaria" AS "timeZone",
        to_char("hora_apertura", 'HH24:MI') AS "openingTime",
        to_char("hora_cierre", 'HH24:MI') AS "closingTime", "actualizada_en" AS "updatedAt"
       FROM "configuracion_operativa" WHERE "id_configuracion" = 1`,
    );
    return rows[0] as SettingsRow;
  }

  async updateSettings(dto: UpdateOperationsSettingsDto, actor: AuthenticatedRequestContext) {
    if (dto.timeZone === undefined && dto.openingTime === undefined && dto.closingTime === undefined) {
      throw new BadRequestException('Debes enviar al menos un campo para actualizar.');
    }
    if (dto.timeZone !== undefined && !this.isValidTimeZone(dto.timeZone)) {
      throw new BadRequestException('La zona horaria no es válida. Usa un identificador IANA, por ejemplo America/Guayaquil.');
    }

    return this.dataSource.transaction(async (manager) => {
      const before = await this.getSettingsWith(manager);
      const timeZone = dto.timeZone ?? before.timeZone;
      const openingTime = dto.openingTime ?? before.openingTime;
      const closingTime = dto.closingTime ?? before.closingTime;
      const rows = await manager.query(
        `UPDATE "configuracion_operativa"
         SET "zona_horaria" = $1, "hora_apertura" = $2::time, "hora_cierre" = $3::time,
             "actualizada_en" = now(), "actualizada_por" = $4
         WHERE "id_configuracion" = 1
         RETURNING "id_configuracion" AS id, "zona_horaria" AS "timeZone",
           to_char("hora_apertura", 'HH24:MI') AS "openingTime",
           to_char("hora_cierre", 'HH24:MI') AS "closingTime", "actualizada_en" AS "updatedAt"`,
        [timeZone, openingTime, closingTime, actor.userId],
      );
      await this.audit(manager, actor, 'operacion', null, 'operations.settings_updated', before, rows[0]);
      return rows[0] as SettingsRow;
    });
  }

  async getCurrent() {
    const settings = await this.getSettings();
    const rows = await this.dataSource.query(
      `SELECT to_char(timezone($1, now())::date, 'YYYY-MM-DD') AS "businessDate"`,
      [settings.timeZone],
    );
    const businessDate = rows[0].businessDate as string;
    const dayRows = await this.dataSource.query(
      `SELECT j."id_jornada" AS id, j."fecha_operativa" AS "businessDate", j."estado" AS status,
          j."abierta_en" AS "openedAt", j."abierta_por" AS "openedBy"
       FROM "jornada_operativa" j WHERE j."fecha_operativa" = $1::date`,
      [businessDate],
    );
    const day = dayRows[0] ?? null;
    if (!day) return { businessDate, operatingDay: null, cashRegister: null };

    const cashRows = await this.dataSource.query(
      `SELECT c."id_caja" AS id, c."estado" AS status,
          c."monto_inicial_ctvs" AS "openingAmountCents", c."abierta_en" AS "openedAt",
          c."abierta_por" AS "openedBy"
       FROM "caja" c WHERE c."id_jornada" = $1`,
      [day.id],
    );
    return { businessDate, operatingDay: day, cashRegister: cashRows[0] ?? null };
  }

  async openDay(actor: AuthenticatedRequestContext) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockOperations(manager);
        const settings = await this.getSettingsWith(manager);
        const rows = await manager.query(
          `INSERT INTO "jornada_operativa" ("fecha_operativa", "estado", "abierta_por")
           VALUES (timezone($1, now())::date, 'open', $2)
           RETURNING "id_jornada" AS id, "fecha_operativa" AS "businessDate", "estado" AS status,
             "abierta_en" AS "openedAt", "abierta_por" AS "openedBy"`,
          [settings.timeZone, actor.userId],
        );
        await this.audit(manager, actor, 'jornada', rows[0].id, 'operations.day_opened', {}, rows[0]);
        return rows[0];
      });
    } catch (error) {
      this.throwConflictForUnique(error, 'Ya existe una jornada para la fecha operativa actual.');
      throw error;
    }
  }

  async openCash(dto: OpenCashRegisterDto, actor: AuthenticatedRequestContext) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockOperations(manager);
        const settings = await this.getSettingsWith(manager);
        const days = await manager.query(
          `SELECT "id_jornada" AS id FROM "jornada_operativa"
           WHERE "fecha_operativa" = timezone($1, now())::date AND "estado" = 'open' FOR UPDATE`,
          [settings.timeZone],
        );
        if (!days[0]) throw new ConflictException('Abre la jornada antes de abrir la caja.');

        const rows = await manager.query(
          `INSERT INTO "caja" ("id_jornada", "estado", "monto_inicial_ctvs", "abierta_por")
           VALUES ($1, 'open', $2, $3)
           RETURNING "id_caja" AS id, "estado" AS status, "monto_inicial_ctvs" AS "openingAmountCents",
             "abierta_en" AS "openedAt", "abierta_por" AS "openedBy"`,
          [days[0].id, dto.openingAmountCents, actor.userId],
        );
        await this.audit(manager, actor, 'caja', rows[0].id, 'operations.cash_opened', {}, rows[0]);
        return rows[0];
      });
    } catch (error) {
      this.throwConflictForUnique(error, 'La jornada actual ya tiene una caja abierta.');
      throw error;
    }
  }

  private async getSettingsWith(manager: import('typeorm').EntityManager): Promise<SettingsRow> {
    const rows = await manager.query(
      `SELECT "id_configuracion" AS id, "zona_horaria" AS "timeZone",
        to_char("hora_apertura", 'HH24:MI') AS "openingTime",
        to_char("hora_cierre", 'HH24:MI') AS "closingTime", "actualizada_en" AS "updatedAt"
       FROM "configuracion_operativa" WHERE "id_configuracion" = 1 FOR UPDATE`,
    );
    return rows[0] as SettingsRow;
  }

  private async lockOperations(manager: import('typeorm').EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(71920405)');
  }

  private async audit(
    manager: import('typeorm').EntityManager,
    actor: AuthenticatedRequestContext,
    resourceType: string,
    resourceId: string | null,
    event: string,
    before: unknown,
    after: unknown,
  ) {
    await manager.query(
      `INSERT INTO "auditoria" ("actor_usuario_id", "actor_tipo", "recurso_tipo", "recurso_id", "evento", "detalle")
       VALUES ($1, 'usuario', $2, $3, $4, $5::jsonb)`,
      [actor.userId, resourceType, resourceId, event, JSON.stringify({ before, after })],
    );
  }

  private isValidTimeZone(timeZone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
      return true;
    } catch {
      return false;
    }
  }

  private throwConflictForUnique(error: unknown, message: string): void {
    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
    ) {
      throw new ConflictException(message);
    }
  }
}
