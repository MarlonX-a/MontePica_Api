import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AuditService } from '../common/audit/audit.service.js';
import { UpdateOperationsSettingsDto } from './dto/update-operations-settings.dto.js';
import { OperationsSettings } from './entities/operations-settings.entity.js';
import {
  GetSettingsFindConfiguracionOperativaRow,
  GetSettingsWithFindConfiguracionOperativaRow,
  UpdateSettingsUpdateConfiguracionOperativaRow,
} from './types/operations.types.js';

type SettingsRow = {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
};

@Injectable()
export class OperationsSettingsService {
  constructor(
    @InjectRepository(OperationsSettings)
    private readonly records: Repository<OperationsSettings>,
    private readonly dataSource: DataSource,
    private readonly auditRecords: AuditService,
  ) {}

  async getSettings() {
    const rows = await this.getSettingsFindConfiguracionOperativa(
      this.records.manager,
    );
    return rows[0] as SettingsRow;
  }

  async updateSettings(
    dto: UpdateOperationsSettingsDto,
    actor: AuthenticatedRequestContext,
  ) {
    if (
      dto.timeZone === undefined &&
      dto.openingTime === undefined &&
      dto.closingTime === undefined &&
      dto.localOrderEditSeconds === undefined
    ) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar.',
      );
    }
    if (dto.timeZone !== undefined && !this.isValidTimeZone(dto.timeZone)) {
      throw new BadRequestException(
        'La zona horaria no es válida. Usa un identificador IANA, por ejemplo America/Guayaquil.',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const before = await this.getSettingsWith(manager);
      const timeZone = dto.timeZone ?? before.timeZone;
      const openingTime = dto.openingTime ?? before.openingTime;
      const closingTime = dto.closingTime ?? before.closingTime;
      const rows = await this.updateSettingsUpdateConfiguracionOperativa(
        manager,
        {
          timeZone,
          openingTime,
          closingTime,
          userId: actor.userId,
          localOrderEditSeconds:
            dto.localOrderEditSeconds ?? before.localOrderEditSeconds,
        },
      );
      await this.audit(
        manager,
        actor,
        'operacion',
        null,
        'operations.settings_updated',
        before,
        rows[0],
      );
      return rows[0] as SettingsRow;
    });
  }

  private async getSettingsWith(
    manager: import('typeorm').EntityManager,
  ): Promise<SettingsRow> {
    const rows = await this.getSettingsWithFindConfiguracionOperativa(manager);
    return rows[0] as SettingsRow;
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
    await this.auditRecords.append(
      manager,
      actor,
      resourceType,
      resourceId,
      event,
      { before, after },
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

  private async getSettingsFindConfiguracionOperativa(
    manager: EntityManager,
  ): Promise<GetSettingsFindConfiguracionOperativaRow[]> {
    return manager
      .getRepository(OperationsSettings)
      .createQueryBuilder('configuracion_operativa')
      .select([
        '"id_configuracion" AS id',
        '"zona_horaria" AS "timeZone"',
        'to_char("hora_apertura", \'HH24:MI\') AS "openingTime"',
        'to_char("hora_cierre", \'HH24:MI\') AS "closingTime"',
        '"edicion_local_seg" AS "localOrderEditSeconds"',
        '"actualizada_en" AS "updatedAt"',
      ])
      .where('"id_configuracion" = 1')
      .getRawMany<GetSettingsFindConfiguracionOperativaRow>();
  }

  private async updateSettingsUpdateConfiguracionOperativa(
    manager: EntityManager,
    input: {
      timeZone: string;
      openingTime: string;
      closingTime: string;
      userId: string;
      localOrderEditSeconds: number;
    },
  ): Promise<UpdateSettingsUpdateConfiguracionOperativaRow[]> {
    const rows = await manager
      .getRepository(OperationsSettings)
      .createQueryBuilder()
      .update(OperationsSettings)
      .set({
        zona_horaria: input.timeZone,
        hora_apertura: () => ':openingTime::time',
        hora_cierre: () => ':closingTime::time',
        actualizada_en: () => 'now()',
        actualizada_por: input.userId,
        edicion_local_seg: input.localOrderEditSeconds,
      })
      .where('"id_configuracion" = 1')
      .returning(
        '"id_configuracion" AS id, "zona_horaria" AS "timeZone",\n           to_char("hora_apertura", \'HH24:MI\') AS "openingTime",\n           to_char("hora_cierre", \'HH24:MI\') AS "closingTime", "edicion_local_seg" AS "localOrderEditSeconds", "actualizada_en" AS "updatedAt"',
      )
      .setParameters({
        openingTime: input.openingTime,
        closingTime: input.closingTime,
      })
      .execute()
      .then((result) => result.raw);
    return rows;
  }

  private async getSettingsWithFindConfiguracionOperativa(
    manager: EntityManager,
  ): Promise<GetSettingsWithFindConfiguracionOperativaRow[]> {
    return manager
      .getRepository(OperationsSettings)
      .createQueryBuilder('configuracion_operativa')
      .select([
        '"id_configuracion" AS id',
        '"zona_horaria" AS "timeZone"',
        'to_char("hora_apertura", \'HH24:MI\') AS "openingTime"',
        'to_char("hora_cierre", \'HH24:MI\') AS "closingTime"',
        '"edicion_local_seg" AS "localOrderEditSeconds"',
        '"actualizada_en" AS "updatedAt"',
      ])
      .where('"id_configuracion" = 1')
      .setLock('pessimistic_write', undefined, undefined)
      .getRawMany<GetSettingsWithFindConfiguracionOperativaRow>();
  }
}
