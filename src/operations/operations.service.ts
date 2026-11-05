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
import type {
  CashClosingPreviewQueryDto,
  CloseCashRegisterDto,
  ListCashRegistersDto,
} from './dto/cash-register.dto.js';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto.js';
import { UpdateOperationsSettingsDto } from './dto/update-operations-settings.dto.js';
import { ParticipationIdempotencyService } from '../tables/participation-idempotency.service.js';
import { RewardsService } from '../rewards/rewards.service.js';
import { lockTableOperations } from '../tables/table-operations.js';

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
  ) {}

  async getSettings() {
    const rows = await this.dataSource.query(
      `SELECT "id_configuracion" AS id, "zona_horaria" AS "timeZone",
        to_char("hora_apertura", 'HH24:MI') AS "openingTime",
        to_char("hora_cierre", 'HH24:MI') AS "closingTime", "edicion_local_seg" AS "localOrderEditSeconds", "actualizada_en" AS "updatedAt"
       FROM "configuracion_operativa" WHERE "id_configuracion" = 1`,
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
      const rows = await manager.query(
        `UPDATE "configuracion_operativa"
         SET "zona_horaria" = $1, "hora_apertura" = $2::time, "hora_cierre" = $3::time,
             "actualizada_en" = now(), "actualizada_por" = $4, "edicion_local_seg" = $5
         WHERE "id_configuracion" = 1
         RETURNING "id_configuracion" AS id, "zona_horaria" AS "timeZone",
           to_char("hora_apertura", 'HH24:MI') AS "openingTime",
           to_char("hora_cierre", 'HH24:MI') AS "closingTime", "edicion_local_seg" AS "localOrderEditSeconds", "actualizada_en" AS "updatedAt"`,
        [
          timeZone,
          openingTime,
          closingTime,
          actor.userId,
          dto.localOrderEditSeconds ?? before.localOrderEditSeconds,
        ],
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
          c."abierta_por" AS "openedBy", cc.id_cierre AS "closureId", cc.cerrado_en AS "closedAt",
          cc.cerrado_por AS "closedBy",cc.fondo_inicial_ctvs::float8 AS "closureOpeningCents",
          cc.ingresos_efectivo_ctvs::float8 AS "closureCashIncomeCents",cc.devoluciones_efectivo_ctvs::float8 AS "closureCashRefundsCents",
          cc.esperado_ctvs::float8 AS "expectedCents",cc.contado_ctvs::float8 AS "countedCents",
          cc.diferencia_ctvs::float8 AS "differenceCents",cc.justificacion AS "closureReason"
       FROM "caja" c LEFT JOIN cierre_caja cc ON cc.id_caja=c.id_caja WHERE c."id_jornada" = $1`,
      [day.id],
    );
    return {
      businessDate,
      operatingDay: day,
      cashRegister: cashRows[0] ?? null,
    };
  }

  async getCashSummary(cashRegisterId: string) {
    const [row] = await this.dataSource.query(
      `SELECT c.id_caja AS "cashRegisterId",c.estado AS status,c.monto_inicial_ctvs::text AS opening,
        COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=c.id_caja AND p.metodo='cash' AND p.estado='confirmed'),0)::text AS income,
        COALESCE((SELECT sum(s.importe_ctvs) FROM salida_caja_devolucion s WHERE s.id_caja=c.id_caja),0)::text AS refunds,
        COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=c.id_caja AND p.metodo='transfer' AND p.estado='confirmed'),0)::text AS transfers,
        cc.id_cierre AS "closureId",cc.cerrado_en AS "closedAt",cc.cerrado_por AS "closedBy",
        cc.contado_ctvs::text AS counted,cc.diferencia_ctvs::text AS difference,cc.justificacion AS reason
       FROM caja c LEFT JOIN cierre_caja cc ON cc.id_caja=c.id_caja WHERE c.id_caja=$1`,
      [cashRegisterId],
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
    const where = `($1::text IS NULL OR c.estado=$1) AND ($2::uuid IS NULL OR c.id_jornada=$2)`;
    const args = [query.status ?? null, query.operatingDayId ?? null];
    const [{ total }] = await this.dataSource.query(
      `SELECT count(*)::int total FROM caja c WHERE ${where}`,
      args,
    );
    const rows = await this.dataSource.query(
      `SELECT c.id_caja AS id,c.id_jornada AS "operatingDayId",c.estado AS status,
      c.monto_inicial_ctvs::float8 AS "openingCents",c.abierta_en AS "openedAt",c.abierta_por AS "openedBy",
      cc.id_cierre AS "closureId",cc.cerrado_en AS "closedAt",cc.cerrado_por AS "closedBy",
      cc.esperado_ctvs::float8 AS "expectedCents",cc.contado_ctvs::float8 AS "countedCents",cc.diferencia_ctvs::float8 AS "differenceCents"
      FROM caja c LEFT JOIN cierre_caja cc ON cc.id_caja=c.id_caja WHERE ${where}
      ORDER BY c.abierta_en DESC,c.id_caja DESC LIMIT $3 OFFSET $4`,
      [...args, query.limit, (query.page - 1) * query.limit],
    );
    return { items: rows, total, page: query.page, limit: query.limit };
  }

  async getCashClosure(cashRegisterId: string) {
    const [row] = await this.dataSource.query(
      `SELECT id_cierre AS id,id_caja AS "cashRegisterId",cerrado_por AS "closedBy",
      cerrado_en AS "closedAt",fondo_inicial_ctvs::float8 AS "openingCents",ingresos_efectivo_ctvs::float8 AS "cashIncomeCents",
      devoluciones_efectivo_ctvs::float8 AS "cashRefundsCents",esperado_ctvs::float8 AS "expectedCents",
      contado_ctvs::float8 AS "countedCents",diferencia_ctvs::float8 AS "differenceCents",justificacion AS reason,'USD' AS currency
      FROM cierre_caja WHERE id_caja=$1`,
      [cashRegisterId],
    );
    if (!row) {
      const [cash] = await this.dataSource.query(
        'SELECT 1 FROM caja WHERE id_caja=$1',
        [cashRegisterId],
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
    const [cash] = await this.dataSource.query(
      `SELECT c.id_caja AS id,c.id_jornada AS day,c.estado AS status,
      c.monto_inicial_ctvs::text opening FROM caja c WHERE c.id_caja=$1`,
      [cashRegisterId],
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
        const [unlockedRef] = await manager.query(
          'SELECT id_jornada AS day FROM caja WHERE id_caja=$1',
          [cashRegisterId],
        );
        if (!unlockedRef) throw new NotFoundException('Caja no encontrada.');
        await manager.query(
          'SELECT estado FROM jornada_operativa WHERE id_jornada=$1 FOR UPDATE',
          [unlockedRef.day],
        );
        const [ref] = await manager.query(
          `SELECT c.id_jornada AS day,c.estado AS status,c.monto_inicial_ctvs::text opening
          FROM caja c WHERE c.id_caja=$1 FOR UPDATE`,
          [cashRegisterId],
        );
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
        const [closure] = await manager.query(
          `INSERT INTO cierre_caja(id_caja,cerrado_por,fondo_inicial_ctvs,ingresos_efectivo_ctvs,
          devoluciones_efectivo_ctvs,esperado_ctvs,contado_ctvs,diferencia_ctvs,justificacion)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_cierre AS id,cerrado_en AS "closedAt"`,
          [
            cashRegisterId,
            actor.userId,
            Number(summary.openingCents),
            Number(summary.cashIncomeCents),
            Number(summary.cashRefundsCents),
            Number(expected),
            dto.countedCents,
            Number(difference),
            dto.reason ?? null,
          ],
        );
        await manager.query(
          `UPDATE caja SET estado='closed' WHERE id_caja=$1`,
          [cashRegisterId],
        );
        await manager.query(
          `INSERT INTO auditoria(actor_usuario_id,actor_tipo,recurso_tipo,recurso_id,evento,detalle)
          VALUES($1,'usuario','caja',$2,'operations.cash_closed',$3::jsonb)`,
          [
            actor.userId,
            cashRegisterId,
            JSON.stringify({
              closureId: closure.id,
              expectedCents: Number(expected),
              countedCents: dto.countedCents,
              differenceCents: Number(difference),
              reason: dto.reason ?? null,
            }),
          ],
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
    const [row] = await manager.query(
      `SELECT u.activo,r.codigo AS role,s.revocada_en,s.expira_en>clock_timestamp() AS valid,
      EXISTS(SELECT 1 FROM rol_permiso rp JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE rp.id_rol=u.id_rol AND p.codigo='operations.closeCash') AS allowed
      FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN sesion_usuario s ON s.id_usuario=u.id_usuario
      WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 FOR SHARE OF u,s`,
      [actor.userId, actor.sessionId],
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
    const [row] = await manager.query(
      `SELECT COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=$1 AND p.metodo='cash' AND p.estado='confirmed'),0)::text income,
      COALESCE((SELECT sum(s.importe_ctvs) FROM salida_caja_devolucion s WHERE s.id_caja=$1),0)::text refunds,
      COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=$1 AND p.metodo='transfer' AND p.estado='confirmed'),0)::text transfers`,
      [id],
    );
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
    const queries: Array<{ key: string; sql: string }> = [
      {
        key: 'pendingSettlements',
        sql: `SELECT id_liquidacion AS id FROM liquidacion WHERE id_caja=$1 AND estado='pending' ORDER BY creada_en DESC,id_liquidacion DESC`,
      },
      {
        key: 'pendingTransfers',
        sql: `SELECT p.id_pago AS id FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=$1 AND p.estado='pendingVerification' ORDER BY p.creado_en DESC,p.id_pago DESC`,
      },
      {
        key: 'unsettledLocalConsumption',
        sql: `SELECT DISTINCT c.id_cuenta AS id FROM cuenta_consumo c WHERE c.id_jornada=$2 AND c.modalidad='local' AND EXISTS(SELECT 1 FROM asignacion_consumo a WHERE a.id_cuenta=c.id_cuenta AND a.estado='active' AND NOT EXISTS(SELECT 1 FROM detalle_liquidacion d JOIN liquidacion l ON l.id_liquidacion=d.id_liquidacion WHERE d.id_asignacion=a.id_asignacion AND d.vigente AND l.estado='settled')) ORDER BY id`,
      },
      {
        key: 'activeOrderReservations',
        sql: `SELECT DISTINCT c.id_cuenta AS id FROM cuenta_consumo c JOIN pedido o ON o.id_cuenta=c.id_cuenta JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' JOIN detalle_pedido dp ON dp.id_version=v.id_version JOIN reserva_inventario ri ON ri.id_detalle=dp.id_detalle AND ri.estado='active' WHERE c.id_jornada=$2 AND c.modalidad='local' ORDER BY id`,
      },
    ];
    const blockers: Record<
      string,
      { items: unknown[]; total: number; page: number; limit: number }
    > = {};
    let total = 0;
    const reasons: Record<string, string> = {
      pendingSettlements: 'Liquidación pendiente de cobro.',
      pendingTransfers: 'Transferencia pendiente de verificación.',
      unsettledLocalConsumption:
        'Consumo local todavía no liquidado y resuelto.',
      activeOrderReservations: 'Pedido local con existencias reservadas.',
    };
    for (const q of queries) {
      const usesDay = q.sql.includes('$2');
      const sql = usesDay ? q.sql.replaceAll('$2', '$1') : q.sql;
      const args = [usesDay ? dayId : cashId];
      const [{ total: count }] = await manager.query(
        `SELECT count(*)::int AS total FROM (${sql}) AS blocker_rows`,
        args,
      );
      const rows = await manager.query(`${sql} LIMIT $2 OFFSET $3`, [
        ...args,
        limit,
        (page - 1) * limit,
      ]);
      blockers[q.key] = {
        items: rows.map((row: Record<string, unknown>) => ({
          ...row,
          reason: reasons[q.key],
        })),
        total: count,
        page,
        limit,
      };
      total += count;
    }
    return { ...blockers, total };
  }

  private async pendingCashDayRefunds(dayId: string) {
    const [row] = await this.dataSource.query(
      `SELECT count(*)::int total,COALESCE(sum(d.importe_ctvs),0)::text AS "amountCents"
      FROM devolucion d JOIN pago p ON p.id_pago=d.id_pago JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion
      WHERE l.id_caja IN(SELECT id_caja FROM caja WHERE id_jornada=$1) AND d.estado='pending'`,
      [dayId],
    );
    const amount = BigInt(row.amountCents);
    if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ConflictException('Las devoluciones pendientes exceden el rango seguro.');
    }
    return { total: row.total, amountCents: Number(amount) };
  }

  private async getCashClosureWith(
    manager: import('typeorm').EntityManager,
    id: string,
  ) {
    const [row] = await manager.query(
      `SELECT id_cierre AS id,id_caja AS "cashRegisterId",cerrado_por AS "closedBy",cerrado_en AS "closedAt",
      fondo_inicial_ctvs::float8 AS "openingCents",ingresos_efectivo_ctvs::float8 AS "cashIncomeCents",devoluciones_efectivo_ctvs::float8 AS "cashRefundsCents",
      esperado_ctvs::float8 AS "expectedCents",contado_ctvs::float8 AS "countedCents",diferencia_ctvs::float8 AS "differenceCents",justificacion AS reason,'USD' AS currency
      FROM cierre_caja WHERE id_caja=$1`,
      [id],
    );
    return row;
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
        if (!days[0])
          throw new ConflictException(
            'Abre la jornada antes de abrir la caja.',
          );

        const rows = await manager.query(
          `INSERT INTO "caja" ("id_jornada", "estado", "monto_inicial_ctvs", "abierta_por")
           VALUES ($1, 'open', $2, $3)
           RETURNING "id_caja" AS id, "estado" AS status, "monto_inicial_ctvs" AS "openingAmountCents",
             "abierta_en" AS "openedAt", "abierta_por" AS "openedBy"`,
          [days[0].id, dto.openingAmountCents, actor.userId],
        );
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
    const rows = await manager.query(
      `SELECT "id_configuracion" AS id, "zona_horaria" AS "timeZone",
        to_char("hora_apertura", 'HH24:MI') AS "openingTime",
        to_char("hora_cierre", 'HH24:MI') AS "closingTime", "edicion_local_seg" AS "localOrderEditSeconds", "actualizada_en" AS "updatedAt"
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
      [
        actor.userId,
        resourceType,
        resourceId,
        event,
        JSON.stringify({ before, after }),
      ],
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
