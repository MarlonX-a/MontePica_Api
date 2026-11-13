import { forEachSequential } from '../common/async/for-each-sequential.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { TransactionLocksService } from '../common/transactions/transaction-locks.service.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../operations/entities/operations-settings.entity.js';
import {
  AuthorizeCashClosureFindRolPermisoRow,
  CashSnapshotFindPagoRow,
  CloseCashFindCajaNextRow,
  CloseCashFindCajaRow,
  CloseCashInsertCierreCajaRow,
  GetCashClosingPreviewFindCajaRow,
  GetCashClosureFindCajaRow,
  GetCashClosureFindCierreCajaRow,
  GetCashClosureWithFindCierreCajaRow,
  GetCashSummaryFindPagoRow,
  GetSettingsWithFindConfiguracionOperativaRow,
  OpenCashFindJornadaOperativaRow,
  OpenCashInsertCajaRow,
  PendingCashDayRefundsFindDevolucionRow,
} from '../operations/types/operations.types.js';
import { InventoryReservation } from '../orders/entities/inventory-reservation.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { OrderVersion } from '../orders/entities/order-version.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { RedemptionReservationsService } from '../redemptions/redemption-reservations.service.js';
import { Refund } from '../refunds/entities/refund.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { type CashClosingPreviewQueryDto } from './dto/cash-closing-preview-query.dto.js';
import { type CloseCashRegisterDto } from './dto/close-cash-register.dto.js';
import { type ListCashRegistersDto } from './dto/list-cash-registers.dto.js';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto.js';
import { CashClosure } from './entities/cash-closure.entity.js';
import { CashRegister } from './entities/cash-register.entity.js';

type SettingsRow = {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
};

@Injectable()
export class CashService {
  constructor(
    @InjectRepository(CashRegister)
    private readonly records: Repository<CashRegister>,
    private readonly dataSource: DataSource,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly rewards: RedemptionReservationsService,
    private readonly auditRecords: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
    private readonly locks: TransactionLocksService,
  ) {}

  async getCashSummary(cashRegisterId: string) {
    const [row] = await this.getCashSummaryFindPago(this.records.manager, {
      cashRegisterId,
    });
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
    return this.queryListCashRegisters(this.records.manager, query);
  }

  async getCashClosure(cashRegisterId: string) {
    const [row] = await this.getCashClosureFindCierreCaja(
      this.records.manager,
      { cashRegisterId },
    );
    if (!row) {
      const [cash] = await this.getCashClosureFindCaja(this.records.manager, {
        cashRegisterId,
      });
      if (!cash) throw new NotFoundException('Caja no encontrada.');
      throw new NotFoundException('La caja todavía no tiene un cierre.');
    }
    return row;
  }

  async getCashClosingPreview(
    cashRegisterId: string,
    query: CashClosingPreviewQueryDto,
  ) {
    const [cash] = await this.getCashClosingPreviewFindCaja(
      this.records.manager,
      { cashRegisterId },
    );
    if (!cash) throw new NotFoundException('Caja no encontrada.');
    const snapshot = await this.cashSnapshot(
      this.records.manager,
      cashRegisterId,
      BigInt(cash.opening),
    );
    const pending = await this.closingBlockers(
      cashRegisterId,
      cash.day,
      this.records.manager,
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
      {
        authorize: (manager) => this.authorizeCashClosure(manager, actor),
        action: async (manager) => {
          await this.operationalContext.lockTableOperations(manager);
          const [unlockedRef] = await this.closeCashFindCaja(manager, {
            cashRegisterId,
          });
          if (!unlockedRef) throw new NotFoundException('Caja no encontrada.');
          await this.closeCashFindJornadaOperativa(manager, {
            day: unlockedRef.day,
          });
          const [ref] = await this.closeCashFindCajaNext(manager, {
            cashRegisterId,
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
          const [closure] = await this.closeCashInsertCierreCaja(manager, {
            cashRegisterId,
            userId: actor.userId,
            openingCents: Number(summary.openingCents),
            cashIncomeCents: Number(summary.cashIncomeCents),
            cashRefundsCents: Number(summary.cashRefundsCents),
            expected: Number(expected),
            countedCents: dto.countedCents,
            difference: Number(difference),
            reason: dto.reason ?? null,
          });
          await this.closeCashUpdateCaja(manager, {
            cashRegisterId,
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
          const response = await this.getCashClosureWith(
            manager,
            cashRegisterId,
          );
          return { resourceId: closure.id, response };
        },
      },
    );
  }

  private async authorizeCashClosure(
    manager: import('typeorm').EntityManager,
    actor: AuthenticatedRequestContext,
  ) {
    if (!actor?.userId || !actor?.sessionId)
      throw new UnauthorizedException('Sesión no válida.');
    const [row] = await this.authorizeCashClosureFindRolPermiso(manager, {
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
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
    const [row] = await this.cashSnapshotFindPago(manager, {
      id,
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
    manager: import('typeorm').EntityManager = this.records.manager,
    page = 1,
    limit = 100,
  ) {
    return this.queryClosingBlockers(manager, cashId, dayId, page, limit);
  }

  private async pendingCashDayRefunds(dayId: string) {
    const [row] = await this.pendingCashDayRefundsFindDevolucion(
      this.records.manager,
      { dayId },
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
    const [row] = await this.getCashClosureWithFindCierreCaja(manager, {
      id,
    });
    return row;
  }

  async openCash(dto: OpenCashRegisterDto, actor: AuthenticatedRequestContext) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockOperations(manager);
        const settings = await this.getSettingsWith(manager);
        const days = await this.openCashFindJornadaOperativa(manager, {
          timeZone: settings.timeZone,
        });
        if (!days[0])
          throw new ConflictException(
            'Abre la jornada antes de abrir la caja.',
          );

        const rows = await this.openCashInsertCaja(manager, {
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

  private getCashSummaryFindPago(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<GetCashSummaryFindPagoRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('c')
      .select([
        'c.id_caja AS "cashRegisterId"',
        'c.estado AS status',
        'c.monto_inicial_ctvs::text AS opening',
        "COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=c.id_caja AND p.metodo='cash' AND p.estado='confirmed'),0)::text AS income",
        'COALESCE((SELECT sum(s.importe_ctvs) FROM salida_caja_devolucion s WHERE s.id_caja=c.id_caja),0)::text AS refunds',
        "COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=c.id_caja AND p.metodo='transfer' AND p.estado='confirmed'),0)::text AS transfers",
        'cc.id_cierre AS "closureId"',
        'cc.cerrado_en AS "closedAt"',
        'cc.cerrado_por AS "closedBy"',
        'cc.contado_ctvs::text AS counted',
        'cc.diferencia_ctvs::text AS difference',
        'cc.justificacion AS reason',
      ])
      .leftJoin(CashClosure, 'cc', 'cc.id_caja=c.id_caja')
      .where('c.id_caja=:cashRegisterId')
      .setParameters({ cashRegisterId: input.cashRegisterId })
      .getRawMany<GetCashSummaryFindPagoRow>();
  }

  private getCashClosureFindCierreCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<GetCashClosureFindCierreCajaRow[]> {
    return manager
      .getRepository(CashClosure)
      .createQueryBuilder('cierre_caja')
      .select([
        'id_cierre AS id',
        'id_caja AS "cashRegisterId"',
        'cerrado_por AS "closedBy"',
        'cerrado_en AS "closedAt"',
        'fondo_inicial_ctvs::float8 AS "openingCents"',
        'ingresos_efectivo_ctvs::float8 AS "cashIncomeCents"',
        'devoluciones_efectivo_ctvs::float8 AS "cashRefundsCents"',
        'esperado_ctvs::float8 AS "expectedCents"',
        'contado_ctvs::float8 AS "countedCents"',
        'diferencia_ctvs::float8 AS "differenceCents"',
        'justificacion AS reason',
        "'USD' AS currency",
      ])
      .where('id_caja=:cashRegisterId')
      .setParameters({ cashRegisterId: input.cashRegisterId })
      .getRawMany<GetCashClosureFindCierreCajaRow>();
  }

  private getCashClosureFindCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<GetCashClosureFindCajaRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('caja')
      .select('1 AS "1"')
      .where('id_caja=:cashRegisterId')
      .setParameters({ cashRegisterId: input.cashRegisterId })
      .getRawMany<GetCashClosureFindCajaRow>();
  }

  private getCashClosingPreviewFindCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<GetCashClosingPreviewFindCajaRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('c')
      .select(
        'c.id_caja AS id, c.id_jornada AS day, c.estado AS status, c.monto_inicial_ctvs::text opening',
      )
      .where('c.id_caja=:cashRegisterId')
      .setParameters({ cashRegisterId: input.cashRegisterId })
      .getRawMany<GetCashClosingPreviewFindCajaRow>();
  }

  private closeCashFindCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<CloseCashFindCajaRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('caja')
      .select('id_jornada AS day')
      .where('id_caja=:cashRegisterId')
      .setParameters({ cashRegisterId: input.cashRegisterId })
      .getRawMany<CloseCashFindCajaRow>();
  }

  private async closeCashFindJornadaOperativa(
    manager: EntityManager,
    input: { day: string },
  ): Promise<void> {
    await manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('estado AS "estado"')
      .where('id_jornada=:day')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ day: input.day })
      .getRawMany();
  }

  private closeCashFindCajaNext(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<CloseCashFindCajaNextRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('c')
      .select(
        'c.id_jornada AS day, c.estado AS status, c.monto_inicial_ctvs::text opening',
      )
      .where('c.id_caja=:cashRegisterId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ cashRegisterId: input.cashRegisterId })
      .getRawMany<CloseCashFindCajaNextRow>();
  }

  private closeCashInsertCierreCaja(
    manager: EntityManager,
    input: {
      cashRegisterId: string;
      userId: string;
      openingCents: number;
      cashIncomeCents: number;
      cashRefundsCents: number;
      expected: number;
      countedCents: number;
      difference: number;
      reason: string | null;
    },
  ): Promise<CloseCashInsertCierreCajaRow[]> {
    return manager
      .getRepository(CashClosure)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_caja: input.cashRegisterId,
          cerrado_por: input.userId,
          fondo_inicial_ctvs: String(input.openingCents),
          ingresos_efectivo_ctvs: String(input.cashIncomeCents),
          devoluciones_efectivo_ctvs: String(input.cashRefundsCents),
          esperado_ctvs: String(input.expected),
          contado_ctvs: String(input.countedCents),
          diferencia_ctvs: String(input.difference),
          justificacion: input.reason,
        },
      ])
      .returning('id_cierre AS id,cerrado_en AS "closedAt"')
      .execute()
      .then((result) => result.raw);
  }

  private async closeCashUpdateCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<void> {
    await manager
      .getRepository(CashRegister)
      .createQueryBuilder()
      .update(CashRegister)
      .set({ estado: 'closed' })
      .where('id_caja=:cashRegisterId')
      .setParameters({ cashRegisterId: input.cashRegisterId })
      .execute();
  }

  private async authorizeCashClosureFindRolPermiso(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizeCashClosureFindRolPermisoRow[]> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
      'operations.closeCash',
    );
    return row ? [row] : [];
  }

  private cashSnapshotFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CashSnapshotFindPagoRow[]> {
    return manager
      .createQueryBuilder()
      .select(
        "COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=:id AND p.metodo='cash' AND p.estado='confirmed'),0)::text income, COALESCE((SELECT sum(s.importe_ctvs) FROM salida_caja_devolucion s WHERE s.id_caja=:id),0)::text refunds, COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=:id AND p.metodo='transfer' AND p.estado='confirmed'),0)::text transfers",
      )
      .from('(SELECT 1)', '_singleton')
      .setParameters({ id: input.id })
      .getRawMany<CashSnapshotFindPagoRow>();
  }

  private pendingCashDayRefundsFindDevolucion(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<PendingCashDayRefundsFindDevolucionRow[]> {
    return manager
      .getRepository(Refund)
      .createQueryBuilder('d')
      .select(
        'count(*)::int total, COALESCE(sum(d.importe_ctvs),0)::text AS "amountCents"',
      )
      .innerJoin(Payment, 'p', 'p.id_pago=d.id_pago')
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .where(
        "l.id_caja IN(SELECT id_caja FROM caja WHERE id_jornada=:dayId) AND d.estado='pending'",
      )
      .setParameters({ dayId: input.dayId })
      .getRawMany<PendingCashDayRefundsFindDevolucionRow>();
  }

  private getCashClosureWithFindCierreCaja(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetCashClosureWithFindCierreCajaRow[]> {
    return manager
      .getRepository(CashClosure)
      .createQueryBuilder('cierre_caja')
      .select([
        'id_cierre AS id',
        'id_caja AS "cashRegisterId"',
        'cerrado_por AS "closedBy"',
        'cerrado_en AS "closedAt"',
        'fondo_inicial_ctvs::float8 AS "openingCents"',
        'ingresos_efectivo_ctvs::float8 AS "cashIncomeCents"',
        'devoluciones_efectivo_ctvs::float8 AS "cashRefundsCents"',
        'esperado_ctvs::float8 AS "expectedCents"',
        'contado_ctvs::float8 AS "countedCents"',
        'diferencia_ctvs::float8 AS "differenceCents"',
        'justificacion AS reason',
        "'USD' AS currency",
      ])
      .where('id_caja=:id')
      .setParameters({ id: input.id })
      .getRawMany<GetCashClosureWithFindCierreCajaRow>();
  }

  private openCashFindJornadaOperativa(
    manager: EntityManager,
    input: { timeZone: string },
  ): Promise<OpenCashFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('"id_jornada" AS id')
      .where(
        '"fecha_operativa" = timezone(:timeZone, now())::date AND "estado" = \'open\'',
      )
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ timeZone: input.timeZone })
      .getRawMany<OpenCashFindJornadaOperativaRow>();
  }

  private openCashInsertCaja(
    manager: EntityManager,
    input: { id: string; openingAmountCents: number; userId: string },
  ): Promise<OpenCashInsertCajaRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_jornada: input.id,
          estado: 'open',
          monto_inicial_ctvs: input.openingAmountCents,
          abierta_por: input.userId,
        },
      ])
      .returning(
        '"id_caja" AS id, "estado" AS status, "monto_inicial_ctvs" AS "openingAmountCents",\n             "abierta_en" AS "openedAt", "abierta_por" AS "openedBy"',
      )
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

  private async queryListCashRegisters(
    manager: EntityManager,
    query: ListCashRegistersDto,
  ) {
    const args = [query.status ?? null, query.operatingDayId ?? null];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(CashRegister)
      .createQueryBuilder('c')
      .select('count(*)::int total')
      .where(
        '(:p1::text IS NULL OR c.estado=:p1) AND (:p2::uuid IS NULL OR c.id_jornada=:p2)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [
      ...args,
      query.limit,
      (query.page - 1) * query.limit,
    ];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const rows = await manager
      .getRepository(CashRegister)
      .createQueryBuilder('c')
      .select([
        'c.id_caja AS id',
        'c.id_jornada AS "operatingDayId"',
        'c.estado AS status',
        'c.monto_inicial_ctvs::float8 AS "openingCents"',
        'c.abierta_en AS "openedAt"',
        'c.abierta_por AS "openedBy"',
        'cc.id_cierre AS "closureId"',
        'cc.cerrado_en AS "closedAt"',
        'cc.cerrado_por AS "closedBy"',
        'cc.esperado_ctvs::float8 AS "expectedCents"',
        'cc.contado_ctvs::float8 AS "countedCents"',
        'cc.diferencia_ctvs::float8 AS "differenceCents"',
      ])
      .leftJoin(CashClosure, 'cc', 'cc.id_caja=c.id_caja')
      .where(
        '(:p1::text IS NULL OR c.estado=:p1) AND (:p2::uuid IS NULL OR c.id_jornada=:p2)',
      )
      .addOrderBy('c.abierta_en', 'DESC')
      .addOrderBy('c.id_caja', 'DESC')
      .limit(Number(queryValues2[2]))
      .offset(Number(queryValues2[3]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items: rows, total, page: query.page, limit: query.limit };
  }

  private async queryClosingBlockers(
    manager: EntityManager,
    cashId: string,
    dayId: string,
    page = 1,
    limit = 100,
  ) {
    const groups = [
      {
        key: 'pendingSettlements',
        reason: 'Liquidación pendiente de cobro.',
        query: manager
          .getRepository(Settlement)
          .createQueryBuilder('l')
          .where("l.id_caja=:cash AND l.estado='pending'"),
        id: 'l.id_liquidacion',
      },
      {
        key: 'pendingTransfers',
        reason: 'Transferencia pendiente de verificación.',
        query: manager
          .getRepository(Payment)
          .createQueryBuilder('p')
          .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
          .where("l.id_caja=:cash AND p.estado='pendingVerification'"),
        id: 'p.id_pago',
      },
      {
        key: 'unsettledLocalConsumption',
        reason: 'Consumo local todavía no liquidado y resuelto.',
        query: manager
          .getRepository(ConsumptionAccount)
          .createQueryBuilder('c')
          .where(
            "c.id_jornada=:day AND c.modalidad='local' AND EXISTS(SELECT 1 FROM asignacion_consumo a WHERE a.id_cuenta=c.id_cuenta AND a.estado='active' AND NOT EXISTS(SELECT 1 FROM detalle_liquidacion d JOIN liquidacion l ON l.id_liquidacion=d.id_liquidacion WHERE d.id_asignacion=a.id_asignacion AND d.vigente AND l.estado='settled'))",
          ),
        id: 'c.id_cuenta',
      },
      {
        key: 'activeOrderReservations',
        reason: 'Pedido local con existencias reservadas.',
        query: manager
          .getRepository(ConsumptionAccount)
          .createQueryBuilder('c')
          .innerJoin(Order, 'o', 'o.id_cuenta=c.id_cuenta')
          .innerJoin(
            OrderVersion,
            'v',
            "v.id_pedido=o.id_pedido AND v.estado='current'",
          )
          .innerJoin(OrderItem, 'd', 'd.id_version=v.id_version')
          .innerJoin(
            InventoryReservation,
            'r',
            "r.id_detalle=d.id_detalle AND r.estado='active'",
          )
          .where("c.id_jornada=:day AND c.modalidad='local'"),
        id: 'c.id_cuenta',
      },
    ];
    const blockers: Record<
      string,
      {
        items: Array<{ id: string; reason: string }>;
        total: number;
        page: number;
        limit: number;
      }
    > = {};
    let total = 0;
    await forEachSequential(groups, async (group) => {
      group.query.setParameters({ cash: cashId, day: dayId });
      const count = Number(
        (
          await group.query
            .clone()
            .select('count(DISTINCT ' + group.id + ')::int', 'total')
            .getRawOne<{ total: number }>()
        )?.total ?? 0,
      );
      const rows = await group.query
        .select(group.id, 'id')
        .distinct(true)
        .orderBy(group.id)
        .limit(limit)
        .offset((page - 1) * limit)
        .getRawMany<{ id: string }>();
      blockers[group.key] = {
        items: rows.map((row) => ({ ...row, reason: group.reason })),
        total: count,
        page,
        limit,
      };
      total += count;
    });
    return { ...blockers, total };
  }
}
