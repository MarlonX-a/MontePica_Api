import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AuditRepository } from '../database/repositories/audit.repository.js';
import { RewardsService } from '../rewards/rewards.service.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { ParticipantsService } from '../tables/participants.service.js';
import { DeliveryService } from '../tables/delivery.service.js';
import { lockTableOperations } from '../tables/table-operations.js';
import type {
  CashClosingPreviewQueryDto,
  CloseCashRegisterDto,
  ListCashRegistersDto,
} from './dto/cash-register.dto.js';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto.js';
import { UpdateOperationsSettingsDto } from './dto/update-operations-settings.dto.js';
import { OperationsRepository } from './repositories/operations.repository.js';
import { OperatingDaysRepository } from './repositories/operating-days.repository.js';
import type {
  CloseOperatingDayDto,
  OperatingDayPreviewQueryDto,
  OpenWithPendingDaysDto,
} from './dto/operating-day.dto.js';

type SettingsRow = {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly rewards: RewardsService,
    private readonly participants: ParticipantsService,
    private readonly delivery: DeliveryService,
    private readonly persistence: OperationsRepository = new OperationsRepository(),
    private readonly auditRecords: AuditRepository = new AuditRepository(),
    private readonly operatingDays: OperatingDaysRepository = new OperatingDaysRepository(),
  ) {}

  async getSettings() {
    const rows = await this.persistence.getSettingsFindConfiguracionOperativa(
      this.dataSource.manager,
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
      const rows =
        await this.persistence.updateSettingsUpdateConfiguracionOperativa(
          manager,
          {
            timeZone: timeZone,
            openingTime: openingTime,
            closingTime: closingTime,
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

  async getCurrent() {
    const settings = await this.getSettings();
    const rows = await this.persistence.getCurrentFindOperation(
      this.dataSource.manager,
      { timeZone: settings.timeZone },
    );
    const businessDate = rows[0].businessDate as string;
    const dayRows = await this.persistence.getCurrentFindJornadaOperativa(
      this.dataSource.manager,
      { businessDate: businessDate },
    );
    const day = dayRows[0] ?? null;
    if (!day) return { businessDate, operatingDay: null, cashRegister: null };

    const cashRows = await this.persistence.getCurrentFindCaja(
      this.dataSource.manager,
      { id: day.id },
    );
    return {
      businessDate,
      operatingDay: day,
      cashRegister: cashRows[0] ?? null,
    };
  }

  async getCashSummary(cashRegisterId: string) {
    const [row] = await this.persistence.getCashSummaryFindPago(
      this.dataSource.manager,
      { cashRegisterId: cashRegisterId },
    );
    if (!row) throw new NotFoundException('Caja no encontrada.');
    const opening = BigInt(row.opening);
    const income = BigInt(row.income);
    const refunds = BigInt(row.refunds);
    const transfers = BigInt(row.transfers);
    const balance = opening + income - refunds;
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (
      [opening, income, refunds, transfers].some(
        (amount) => amount < 0n || amount > max,
      ) ||
      balance < -max ||
      balance > max
    ) {
      throw new ConflictException(
        'Los importes acumulados de caja exceden el rango seguro.',
      );
    }
    return {
      cashRegisterId: row.cashRegisterId,
      status: row.status,
      openingCents: Number(opening),
      cashIncomeCents: Number(income),
      cashRefundsCents: Number(refunds),
      balanceCents: Number(balance),
      confirmedTransferCents: Number(transfers),
      closure: row.closureId
        ? {
            id: row.closureId,
            closedAt: row.closedAt,
            closedBy: row.closedBy,
            countedCents: Number(row.counted),
            differenceCents: Number(row.difference),
            reason: row.reason,
          }
        : null,
      currency: 'USD',
    };
  }

  async listCashRegisters(query: ListCashRegistersDto) {
    return this.persistence.listCashRegisters(this.dataSource.manager, query);
  }

  async getCashClosure(cashRegisterId: string) {
    const [row] = await this.persistence.getCashClosureFindCierreCaja(
      this.dataSource.manager,
      { cashRegisterId: cashRegisterId },
    );
    if (!row) {
      const [cash] = await this.persistence.getCashClosureFindCaja(
        this.dataSource.manager,
        { cashRegisterId: cashRegisterId },
      );
      if (!cash) throw new NotFoundException('Caja no encontrada.');
      throw new NotFoundException('La caja todavía no tiene un cierre.');
    }
    return row;
  }

  async getCashClosingPreview(
    cashRegisterId: string,
    query: CashClosingPreviewQueryDto,
  ) {
    const [cash] = await this.persistence.getCashClosingPreviewFindCaja(
      this.dataSource.manager,
      { cashRegisterId: cashRegisterId },
    );
    if (!cash) throw new NotFoundException('Caja no encontrada.');
    const snapshot = await this.cashSnapshot(
      this.dataSource.manager,
      cashRegisterId,
      BigInt(cash.opening),
    );
    const pending = await this.closingBlockers(
      cashRegisterId,
      cash.day,
      this.dataSource.manager,
      query.page,
      query.limit,
    );
    return {
      cashRegisterId,
      status: cash.status,
      ...snapshot,
      canClose: cash.status === 'open' && pending.total === 0,
      blockers: pending,
      pendingRefunds: await this.pendingCashDayRefunds(cash.day),
      currency: 'USD',
    };
  }

  async closeCash(
    cashRegisterId: string,
    dto: CloseCashRegisterDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idempotency.run(
      { userId: actor.userId },
      `admin/operations/cash/${cashRegisterId.toLowerCase()}/close`,
      key,
      dto,
      200,
      'cierre_caja',
      (manager) => this.authorizeCashClosure(manager, actor),
      async (manager) => {
        await lockTableOperations(manager);
        const [unlockedRef] = await this.persistence.closeCashFindCaja(
          manager,
          { cashRegisterId: cashRegisterId },
        );
        if (!unlockedRef) throw new NotFoundException('Caja no encontrada.');
        await this.persistence.closeCashFindJornadaOperativa(manager, {
          day: unlockedRef.day,
        });
        const [ref] = await this.persistence.closeCashFindCajaNext(manager, {
          cashRegisterId: cashRegisterId,
        });
        if (!ref) throw new NotFoundException('Caja no encontrada.');
        if (ref.status !== 'open')
          throw new ConflictException('La caja ya está cerrada.');
        const blockers = await this.closingBlockers(
          cashRegisterId,
          ref.day,
          manager,
        );
        if (blockers.total)
          throw new ConflictException(
            'Resuelve los bloqueos de caja antes de cerrarla.',
          );
        const summary = await this.cashSnapshot(
          manager,
          cashRegisterId,
          BigInt(ref.opening),
        );
        const counted = BigInt(dto.countedCents);
        const expected = BigInt(summary.expectedCents);
        const difference = counted - expected;
        const max = BigInt(Number.MAX_SAFE_INTEGER);
        if (
          counted > max ||
          expected < -max ||
          expected > max ||
          difference < -max ||
          difference > max
        ) {
          throw new ConflictException(
            'El saldo conciliado excede el rango seguro.',
          );
        }
        if (difference !== 0n && !dto.reason)
          throw new BadRequestException(
            'Debes justificar el faltante o sobrante.',
          );
        await this.rewards.releaseForOperatingDay(manager, ref.day);
        const [closure] = await this.persistence.closeCashInsertCierreCaja(
          manager,
          {
            cashRegisterId: cashRegisterId,
            userId: actor.userId,
            openingCents: Number(summary.openingCents),
            cashIncomeCents: Number(summary.cashIncomeCents),
            cashRefundsCents: Number(summary.cashRefundsCents),
            expected: Number(expected),
            countedCents: dto.countedCents,
            difference: Number(difference),
            reason: dto.reason ?? null,
          },
        );
        await this.persistence.closeCashUpdateCaja(manager, {
          cashRegisterId: cashRegisterId,
        });
        await this.auditRecords.append(
          manager,
          { userId: actor.userId },
          'caja',
          cashRegisterId,
          'operations.cash_closed',
          {
            closureId: closure.id,
            expectedCents: Number(expected),
            countedCents: dto.countedCents,
            differenceCents: Number(difference),
            reason: dto.reason ?? null,
          },
        );
        const response = await this.getCashClosureWith(manager, cashRegisterId);
        return { resourceId: closure.id, response };
      },
    );
  }

  private async authorizeCashClosure(
    manager: import('typeorm').EntityManager,
    actor: AuthenticatedRequestContext,
  ) {
    if (!actor?.userId || !actor?.sessionId)
      throw new UnauthorizedException('Sesión no válida.');
    const [row] = await this.persistence.authorizeCashClosureFindRolPermiso(
      manager,
      { userId: actor.userId, sessionId: actor.sessionId },
    );
    if (!row || !row.activo || row.revocada_en || !row.valid)
      throw new UnauthorizedException('Sesión no válida.');
    if (row.role !== 'admin' || !row.allowed)
      throw new ForbiddenException('Solo un administrador puede cerrar cajas.');
  }

  private async cashSnapshot(
    manager: import('typeorm').EntityManager,
    id: string,
    opening: bigint,
  ) {
    const [row] = await this.persistence.cashSnapshotFindPago(manager, {
      id: id,
    });
    const income = BigInt(row.income),
      refunds = BigInt(row.refunds),
      transfers = BigInt(row.transfers),
      expected = opening + income - refunds;
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (
      [opening, income, refunds, transfers].some((n) => n < 0n || n > max) ||
      expected < -max ||
      expected > max
    )
      throw new ConflictException(
        'Los importes acumulados de caja exceden el rango seguro.',
      );
    return {
      openingCents: Number(opening),
      cashIncomeCents: Number(income),
      cashRefundsCents: Number(refunds),
      expectedCents: Number(expected),
      confirmedTransferCents: Number(transfers),
    };
  }

  private async closingBlockers(
    cashId: string,
    dayId: string,
    manager: import('typeorm').EntityManager = this.dataSource.manager,
    page = 1,
    limit = 100,
  ) {
    return this.persistence.closingBlockers(
      manager,
      cashId,
      dayId,
      page,
      limit,
    );
  }

  private async pendingCashDayRefunds(dayId: string) {
    const [row] = await this.persistence.pendingCashDayRefundsFindDevolucion(
      this.dataSource.manager,
      { dayId: dayId },
    );
    const amount = BigInt(row.amountCents);
    if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ConflictException(
        'Las devoluciones pendientes exceden el rango seguro.',
      );
    }
    return { total: row.total, amountCents: Number(amount) };
  }

  private async getCashClosureWith(
    manager: import('typeorm').EntityManager,
    id: string,
  ) {
    const [row] = await this.persistence.getCashClosureWithFindCierreCaja(
      manager,
      { id: id },
    );
    return row;
  }

  async openDay(actor: AuthenticatedRequestContext) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockOperations(manager);
        const settings = await this.getSettingsWith(manager);
        const pendingDays = await this.operatingDays.findOpenDayIds(
          manager,
          settings.timeZone,
        );
        if (pendingDays.length)
          throw new ConflictException(
            'Cierra las jornadas anteriores antes de abrir la jornada actual.',
          );
        const rows = await this.persistence.openDayInsertJornadaOperativa(
          manager,
          { timeZone: settings.timeZone, userId: actor.userId },
        );
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
      (manager) => this.authorizeOperatingAction(manager, actor, 'exception'),
      async (manager) => {
        await this.lockOperations(manager);
        const settings = await this.getSettingsWith(manager);
        const pendingDays = await this.operatingDays.findOpenDayIds(
          manager,
          settings.timeZone,
        );
        if (!pendingDays.length)
          throw new ConflictException(
            'No existen jornadas anteriores abiertas que requieran recuperación.',
          );
        const current = await this.operatingDays.findCurrentDay(
          manager,
          settings.timeZone,
        );
        if (current.length)
          throw new ConflictException(
            'Ya existe una jornada para la fecha operativa actual.',
          );
        const day = await this.operatingDays.insertExceptionOpening(manager, {
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
    );
  }

  async getOperatingDay(id: string) {
    const day = await this.operatingDays.findDay(this.dataSource.manager, id);
    if (!day) throw new NotFoundException('Jornada no encontrada.');
    return day;
  }

  async getOperatingDayClosure(id: string) {
    const day = await this.operatingDays.findDay(this.dataSource.manager, id);
    if (!day) throw new NotFoundException('Jornada no encontrada.');
    const closure = await this.operatingDays.findClosure(
      this.dataSource.manager,
      id,
    );
    if (!closure)
      throw new NotFoundException('La jornada todavía no tiene cierre.');
    return { ...closure, currency: 'USD' as const };
  }

  async getOperatingDayClosingPreview(
    id: string,
    query: OperatingDayPreviewQueryDto,
  ) {
    const day = await this.operatingDays.findDay(this.dataSource.manager, id);
    if (!day) throw new NotFoundException('Jornada no encontrada.');
    const [counts, blockers, cleanupActions, pendingRefunds] =
      await Promise.all([
        this.operatingDays.blockerCounts(this.dataSource.manager, id),
        this.operatingDays.blockers(
          this.dataSource.manager,
          id,
          query.page,
          query.limit,
        ),
        this.operatingDays.cleanupCounts(this.dataSource.manager, id),
        this.pendingOperatingDayRefunds(this.dataSource.manager, id),
      ]);
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
      operatingDayId: id,
      canClose: day.status === 'open' && total === 0,
      counts,
      blockers: blockers.items,
      totalBlockers: blockers.total,
      page: query.page,
      limit: query.limit,
      cleanupActions,
      pendingRefunds,
      currency: 'USD' as const,
    };
  }

  async closeOperatingDay(
    id: string,
    dto: CloseOperatingDayDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idempotency.run(
      { userId: actor.userId },
      `admin/operations/days/${id.toLowerCase()}/close`,
      key,
      dto,
      200,
      'cierre_jornada',
      (manager) => this.authorizeOperatingAction(manager, actor, 'close'),
      async (manager) => {
        await this.lockOperations(manager);
        const day = await this.operatingDays.findDayForUpdate(manager, id);
        if (!day) throw new NotFoundException('Jornada no encontrada.');
        if (day.status !== 'open')
          throw new ConflictException('La jornada ya está cerrada.');
        await this.operatingDays.lockDayResources(manager, id);
        const blockers = await this.operatingDays.blockers(manager, id, 1, 1);
        if (blockers.total)
          throw new ConflictException(
            'Resuelve los pendientes de la jornada antes de cerrarla.',
          );

        const before = await this.operatingDays.cleanupCounts(manager, id);
        await this.rewards.releaseForOperatingDay(manager, id);
        const visitCleanup = await this.participants.closeForOperatingDay(
          manager,
          id,
          { userId: actor.userId },
        );
        const cancelledDeliveryRequests =
          await this.delivery.cancelUnusedForOperatingDay(manager, id, actor);
        const pendingRefunds = await this.pendingOperatingDayRefunds(
          manager,
          id,
        );
        if (await this.operatingDays.assertNoReservations(manager, id))
          throw new ConflictException(
            'Quedaron reservas de canje sin resolver; el cierre se revirtió.',
          );

        const current = await this.operatingDays.findDay(manager, id);
        const summary: Record<string, number> = {
          ...before,
          ...visitCleanup,
          cancelledDeliveryRequests,
          pendingRefunds: pendingRefunds.total,
          pendingRefundAmountCents: pendingRefunds.amountCents,
        };
        const closure = await this.operatingDays.insertClosure(manager, {
          dayId: id,
          cashClosureId: current?.cashClosureId ?? null,
          userId: actor.userId,
          notes: dto.notes ?? null,
          summary,
        });
        await this.operatingDays.closeDay(manager, id);
        await this.auditRecords.append(
          manager,
          { userId: actor.userId },
          'jornada_operativa',
          id,
          'operations.day_closed',
          { before, summary, closureId: closure.id, notes: dto.notes ?? null },
        );
        return {
          resourceId: closure.id,
          response: { ...closure, currency: 'USD' as const },
        };
      },
    );
  }

  private async authorizeOperatingAction(
    manager: import('typeorm').EntityManager,
    actor: AuthenticatedRequestContext,
    action: 'close' | 'exception',
  ) {
    if (!actor?.userId || !actor?.sessionId)
      throw new UnauthorizedException('Sesión no válida.');
    const row =
      action === 'close'
        ? await this.operatingDays.closeDayRole(manager, {
            userId: actor.userId,
            sessionId: actor.sessionId,
          })
        : await this.operatingDays.exceptionOpeningRole(manager, {
            userId: actor.userId,
            sessionId: actor.sessionId,
          });
    if (!row || !row.activo || row.revocada_en || !row.valid)
      throw new UnauthorizedException('Sesión no válida.');
    if (row.role !== 'admin' || !row.allowed)
      throw new ForbiddenException(
        'Solo un administrador puede realizar esta operación.',
      );
  }

  private async pendingOperatingDayRefunds(
    manager: import('typeorm').EntityManager,
    dayId: string,
  ) {
    const row = await this.operatingDays.pendingRefunds(manager, dayId);
    const amount = BigInt(row.amountCents);
    if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ConflictException(
        'Las devoluciones pendientes exceden el rango seguro.',
      );
    return { total: row.total, amountCents: Number(amount) };
  }

  async openCash(dto: OpenCashRegisterDto, actor: AuthenticatedRequestContext) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockOperations(manager);
        const settings = await this.getSettingsWith(manager);
        const days = await this.persistence.openCashFindJornadaOperativa(
          manager,
          { timeZone: settings.timeZone },
        );
        if (!days[0])
          throw new ConflictException(
            'Abre la jornada antes de abrir la caja.',
          );

        const rows = await this.persistence.openCashInsertCaja(manager, {
          id: days[0].id,
          openingAmountCents: dto.openingAmountCents,
          userId: actor.userId,
        });
        await this.audit(
          manager,
          actor,
          'caja',
          rows[0].id,
          'operations.cash_opened',
          {},
          rows[0],
        );
        return rows[0];
      });
    } catch (error) {
      this.throwConflictForUnique(
        error,
        'La jornada actual ya tiene una caja abierta.',
      );
      throw error;
    }
  }

  private async getSettingsWith(
    manager: import('typeorm').EntityManager,
  ): Promise<SettingsRow> {
    const rows =
      await this.persistence.getSettingsWithFindConfiguracionOperativa(manager);
    return rows[0] as SettingsRow;
  }

  private async lockOperations(manager: import('typeorm').EntityManager) {
    await this.persistence.lockOperationsFindOperation(manager);
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

  private throwConflictForUnique(error: unknown, message: string): void {
    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    ) {
      throw new ConflictException(message);
    }
  }
}
