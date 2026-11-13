import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CashClosure } from '../cash/entities/cash-closure.entity.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { TransactionLocksService } from '../common/transactions/transaction-locks.service.js';
import { type OpenWithPendingDaysDto } from './dto/open-with-pending-days.dto.js';
import { ExceptionalDayOpening } from './entities/exceptional-day-opening.entity.js';
import { OperatingDayClosure } from './entities/operating-day-closure.entity.js';
import { OperatingDay } from './entities/operating-day.entity.js';
import { OperationsSettings } from './entities/operations-settings.entity.js';
import {
  OpenOperatingDayRow,
  OperatingDayRow,
} from './types/operating-days.types.js';
import {
  GetCurrentFindCajaRow,
  GetCurrentFindJornadaOperativaRow,
  GetCurrentFindOperationRow,
  GetSettingsFindConfiguracionOperativaRow,
  GetSettingsWithFindConfiguracionOperativaRow,
  OpenDayInsertJornadaOperativaRow,
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
export class OperatingDaysService {
  constructor(
    @InjectRepository(OperatingDay)
    private readonly records: Repository<OperatingDay>,
    private readonly dataSource: DataSource,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly auditRecords: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly locks: TransactionLocksService,
  ) {}

  private async getSettings() {
    const rows = await this.getSettingsFindConfiguracionOperativa(
      this.records.manager,
    );
    return rows[0] as SettingsRow;
  }

  async getCurrent() {
    const settings = await this.getSettings();
    const rows = await this.getCurrentFindOperation(this.records.manager, {
      timeZone: settings.timeZone,
    });
    const businessDate = rows[0].businessDate as string;
    const dayRows = await this.getCurrentFindJornadaOperativa(
      this.records.manager,
      { businessDate },
    );
    const day = dayRows[0] ?? null;
    if (!day) return { businessDate, operatingDay: null, cashRegister: null };
    const cashRows = await this.getCurrentFindCaja(this.records.manager, {
      id: day.id,
    });
    return {
      businessDate,
      operatingDay: day,
      cashRegister: cashRows[0] ?? null,
    };
  }

  async openDay(actor: AuthenticatedRequestContext) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockOperations(manager);
        const settings = await this.getSettingsWith(manager);
        const pendingDays = await this.findOpenDayIds(
          manager,
          settings.timeZone,
        );
        if (pendingDays.length)
          throw new ConflictException(
            'Cierra las jornadas anteriores antes de abrir la jornada actual.',
          );
        const rows = await this.openDayInsertJornadaOperativa(manager, {
          timeZone: settings.timeZone,
          userId: actor.userId,
        });
        await this.audit(
          manager,
          actor,
          'jornada',
          rows[0].id,
          'operations.day_opened',
          {},
          rows[0],
        );
        return rows[0];
      });
    } catch (error) {
      this.throwConflictForUnique(
        error,
        'Ya existe una jornada para la fecha operativa actual.',
      );
      throw error;
    }
  }

  async openWithPendingDays(
    dto: OpenWithPendingDaysDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idempotency.run(
      { userId: actor.userId },
      'admin/operations/days/open-with-pending-days',
      key,
      dto,
      201,
      'jornada_operativa',
      {
        authorize: (manager) =>
          this.authorizeOperatingAction(manager, actor, 'exception'),
        action: async (manager) => {
          await this.lockOperations(manager);
          const settings = await this.getSettingsWith(manager);
          const pendingDays = await this.findOpenDayIds(
            manager,
            settings.timeZone,
          );
          if (!pendingDays.length)
            throw new ConflictException(
              'No existen jornadas anteriores abiertas que requieran recuperación.',
            );
          const current = await this.findCurrentDay(manager, settings.timeZone);
          if (current.length)
            throw new ConflictException(
              'Ya existe una jornada para la fecha operativa actual.',
            );
          const day = await this.insertExceptionOpening(manager, {
            timeZone: settings.timeZone,
            userId: actor.userId,
            reason: dto.reason,
            previousDayIds: pendingDays.map((item) => item.id),
          });
          await this.auditRecords.append(
            manager,
            { userId: actor.userId },
            'jornada_operativa',
            day.id,
            'operations.day_opened_with_pending_days',
            {
              reason: dto.reason,
              pendingOperatingDays: pendingDays,
            },
          );
          return {
            resourceId: day.id,
            response: {
              ...day,
              exceptionalOpening: {
                reason: dto.reason,
                pendingOperatingDayIds: pendingDays.map((item) => item.id),
              },
            },
          };
        },
      },
    );
  }

  async getOperatingDay(id: string) {
    const day = await this.findDay(this.records.manager, id);
    if (!day) throw new NotFoundException('Jornada no encontrada.');
    return day;
  }

  private async authorizeOperatingAction(
    manager: import('typeorm').EntityManager,
    actor: AuthenticatedRequestContext,
    action: 'close' | 'exception',
  ) {
    await this.authorization.requirePermission(
      manager,
      actor,
      action === 'close'
        ? 'operations.closeDay'
        : 'operations.openWithPendingDays',
      {
        adminOnly: true,
        adminMessage: 'Solo un administrador puede realizar esta operación.',
      },
    );
  }

  private async getSettingsWith(
    manager: import('typeorm').EntityManager,
  ): Promise<SettingsRow> {
    const rows = await this.getSettingsWithFindConfiguracionOperativa(manager);
    return rows[0] as SettingsRow;
  }

  private async lockOperations(manager: import('typeorm').EntityManager) {
    await this.lockOperationsFindOperation(manager);
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

  private throwConflictForUnique(error: unknown, message: string): void {
    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    ) {
      throw new ConflictException(message);
    }
  }

  private getSettingsFindConfiguracionOperativa(
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

  private getCurrentFindOperation(
    manager: EntityManager,
    input: { timeZone: string },
  ): Promise<GetCurrentFindOperationRow[]> {
    return manager
      .createQueryBuilder()
      .select(
        'to_char(timezone(:timeZone, now())::date, \'YYYY-MM-DD\') AS "businessDate"',
      )
      .from('(SELECT 1)', '_singleton')
      .setParameters({ timeZone: input.timeZone })
      .getRawMany<GetCurrentFindOperationRow>();
  }

  private getCurrentFindJornadaOperativa(
    manager: EntityManager,
    input: { businessDate: string },
  ): Promise<GetCurrentFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('j')
      .select([
        'j."id_jornada" AS id',
        'j."fecha_operativa" AS "businessDate"',
        'j."estado" AS status',
        'j."abierta_en" AS "openedAt"',
        'j."abierta_por" AS "openedBy"',
      ])
      .where('j."fecha_operativa" = :businessDate::date')
      .setParameters({ businessDate: input.businessDate })
      .getRawMany<GetCurrentFindJornadaOperativaRow>();
  }

  private getCurrentFindCaja(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetCurrentFindCajaRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('c')
      .select([
        'c."id_caja" AS id',
        'c."estado" AS status',
        'c."monto_inicial_ctvs" AS "openingAmountCents"',
        'c."abierta_en" AS "openedAt"',
        'c."abierta_por" AS "openedBy"',
        'cc.id_cierre AS "closureId"',
        'cc.cerrado_en AS "closedAt"',
        'cc.cerrado_por AS "closedBy"',
        'cc.fondo_inicial_ctvs::float8 AS "closureOpeningCents"',
        'cc.ingresos_efectivo_ctvs::float8 AS "closureCashIncomeCents"',
        'cc.devoluciones_efectivo_ctvs::float8 AS "closureCashRefundsCents"',
        'cc.esperado_ctvs::float8 AS "expectedCents"',
        'cc.contado_ctvs::float8 AS "countedCents"',
        'cc.diferencia_ctvs::float8 AS "differenceCents"',
        'cc.justificacion AS "closureReason"',
      ])
      .leftJoin(CashClosure, 'cc', 'cc.id_caja=c.id_caja')
      .where('c."id_jornada" = :id')
      .setParameters({ id: input.id })
      .getRawMany<GetCurrentFindCajaRow>();
  }

  private openDayInsertJornadaOperativa(
    manager: EntityManager,
    input: { timeZone: string; userId: string },
  ): Promise<OpenDayInsertJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder()
      .insert()
      .values([
        {
          fecha_operativa: () => 'timezone(:timeZone, now())::date',
          estado: 'open',
          abierta_por: input.userId,
        },
      ])
      .returning(
        '"id_jornada" AS id, "fecha_operativa" AS "businessDate", "estado" AS status,\n             "abierta_en" AS "openedAt", "abierta_por" AS "openedBy"',
      )
      .setParameters({ timeZone: input.timeZone })
      .execute()
      .then((result) => result.raw);
  }

  private getSettingsWithFindConfiguracionOperativa(
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

  private async lockOperationsFindOperation(
    manager: EntityManager,
  ): Promise<void> {
    await this.locks.acquire(manager);
  }

  private async findDay(
    manager: EntityManager,
    id: string,
  ): Promise<OperatingDayRow | undefined> {
    const [row] = await manager
      .getRepository(OperatingDay)
      .createQueryBuilder('j')
      .select([
        'j.id_jornada AS id',
        'j.fecha_operativa::text AS "businessDate"',
        'j.estado AS status',
        'j.abierta_en AS "openedAt"',
        'j.abierta_por AS "openedBy"',
        'cj.id_cierre AS "closureId"',
        'cj.cerrado_en AS "closedAt"',
        'cj.cerrado_por AS "closedBy"',
        'c.id_caja AS "cashRegisterId"',
        'c.estado AS "cashStatus"',
        'cc.id_cierre AS "cashClosureId"',
      ])
      .leftJoin(OperatingDayClosure, 'cj', 'cj.id_jornada=j.id_jornada')
      .leftJoin(CashRegister, 'c', 'c.id_jornada=j.id_jornada')
      .leftJoin(CashClosure, 'cc', 'cc.id_caja=c.id_caja')
      .where('j.id_jornada=:id')
      .setParameters({ id })
      .getRawMany();
    return row;
  }

  private findOpenDayIds(
    manager: EntityManager,
    timeZone: string,
  ): Promise<Array<{ id: string; businessDate: string }>> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select(['id_jornada AS id', 'fecha_operativa::text AS "businessDate"'])
      .where(
        "estado='open' AND fecha_operativa < timezone(:timeZone,clock_timestamp())::date",
      )
      .addOrderBy('fecha_operativa', 'ASC')
      .addOrderBy('id_jornada', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ timeZone })
      .getRawMany();
  }

  private findCurrentDay(
    manager: EntityManager,
    timeZone: string,
  ): Promise<Array<{ id: string }>> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('id_jornada AS id')
      .where('fecha_operativa=timezone(:timeZone,clock_timestamp())::date')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ timeZone })
      .getRawMany();
  }

  private async insertExceptionOpening(
    manager: EntityManager,
    input: {
      timeZone: string;
      userId: string;
      reason: string;
      previousDayIds: string[];
    },
  ): Promise<OpenOperatingDayRow> {
    const [day] = await manager
      .getRepository(OperatingDay)
      .createQueryBuilder()
      .insert()
      .values([
        {
          fecha_operativa: () => 'timezone(:timeZone,clock_timestamp())::date',
          estado: 'open',
          abierta_por: input.userId,
        },
      ])
      .returning(
        'id_jornada AS id,fecha_operativa::text AS "businessDate",estado AS status,abierta_en AS "openedAt",abierta_por AS "openedBy"',
      )
      .setParameters({ timeZone: input.timeZone })
      .execute()
      .then((result) => result.raw);

    await manager
      .getRepository(ExceptionalDayOpening)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_jornada: day.id,
          abierta_por: input.userId,
          motivo: input.reason,
          jornadas_pendientes: () => ':previousDayIds::uuid[]',
        },
      ])
      .setParameters({ previousDayIds: input.previousDayIds })
      .execute();
    return day;
  }
}
