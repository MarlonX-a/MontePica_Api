import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';
import { OperationalLockRepository } from '../../database/repositories/operational-lock.repository.js';
import type { ListCashRegistersDto } from '../dto/cash-register.dto.js';
// Read builders

// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
import type { EntityManager } from 'typeorm';
export interface GetSettingsFindConfiguracionOperativaRow {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
}
export interface UpdateSettingsUpdateConfiguracionOperativaRow {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
}
export interface GetCurrentFindOperationRow {
  businessDate: string;
}
export interface GetCurrentFindJornadaOperativaRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
}
export interface GetCurrentFindCajaRow {
  id: string;
  status: string;
  openingAmountCents: number;
  openedAt: Date;
  openedBy: string;
  closureId: string;
  closedAt: Date;
  closedBy: string;
  closureOpeningCents: number;
  closureCashIncomeCents: number;
  closureCashRefundsCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  closureReason: string;
}
export interface GetCashSummaryFindPagoRow {
  cashRegisterId: string;
  status: string;
  opening: string;
  income: string;
  refunds: string;
  transfers: string;
  closureId: string;
  closedAt: Date;
  closedBy: string;
  counted: string;
  difference: string;
  reason: string;
}
export interface ListCashRegistersFindCajaRow {
  total: number;
}
export interface ListCashRegistersFindCajaNextRow {
  id: string;
  operatingDayId: string;
  status: string;
  openingCents: number;
  openedAt: Date;
  openedBy: string;
  closureId: string;
  closedAt: Date;
  closedBy: string;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
}
export interface GetCashClosureFindCierreCajaRow {
  id: string;
  cashRegisterId: string;
  closedBy: string;
  closedAt: Date;
  openingCents: number;
  cashIncomeCents: number;
  cashRefundsCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  reason: string;
  currency: string;
}
export interface GetCashClosureFindCajaRow {
  '1': string;
}
export interface GetCashClosingPreviewFindCajaRow {
  id: string;
  day: string;
  status: string;
  opening: string;
}
export interface CloseCashFindCajaRow {
  day: string;
}
export interface CloseCashFindCajaNextRow {
  day: string;
  status: string;
  opening: string;
}
export interface CloseCashInsertCierreCajaRow {
  id: string;
  closedAt: Date;
}
export interface AuthorizeCashClosureFindRolPermisoRow {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}
export interface CashSnapshotFindPagoRow {
  income: string;
  refunds: string;
  transfers: string;
}
export interface ClosingBlockersFindOperationRow {
  total: number;
}
export interface ClosingBlockersLockOperationRow {
  id: string;
}
export interface PendingCashDayRefundsFindDevolucionRow {
  total: number;
  amountCents: string;
}
export interface GetCashClosureWithFindCierreCajaRow {
  id: string;
  cashRegisterId: string;
  closedBy: string;
  closedAt: Date;
  openingCents: number;
  cashIncomeCents: number;
  cashRefundsCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  reason: string;
  currency: string;
}
export interface OpenDayInsertJornadaOperativaRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
}
export interface OpenCashFindJornadaOperativaRow {
  id: string;
}
export interface OpenCashInsertCajaRow {
  id: string;
  status: string;
  openingAmountCents: number;
  openedAt: Date;
  openedBy: string;
}
export interface GetSettingsWithFindConfiguracionOperativaRow {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
}
export class OperationsRepository {
  async getSettingsFindConfiguracionOperativa(
    manager: EntityManager,
  ): Promise<GetSettingsFindConfiguracionOperativaRow[]> {
    return manager.query<GetSettingsFindConfiguracionOperativaRow[]>(
      `SELECT "id_configuracion" AS id, "zona_horaria" AS "timeZone",
        to_char("hora_apertura", 'HH24:MI') AS "openingTime",
        to_char("hora_cierre", 'HH24:MI') AS "closingTime", "edicion_local_seg" AS "localOrderEditSeconds", "actualizada_en" AS "updatedAt"
       FROM "configuracion_operativa" WHERE "id_configuracion" = 1`,
      [],
    );
  }
  async updateSettingsUpdateConfiguracionOperativa(
    manager: EntityManager,
    input: {
      timeZone: string;
      openingTime: string;
      closingTime: string;
      userId: string;
      localOrderEditSeconds: number;
    },
  ): Promise<UpdateSettingsUpdateConfiguracionOperativaRow[]> {
    const [rows] = await manager.query<
      [UpdateSettingsUpdateConfiguracionOperativaRow[], number]
    >(
      `UPDATE "configuracion_operativa"
         SET "zona_horaria" = $1, "hora_apertura" = $2::time, "hora_cierre" = $3::time,
             "actualizada_en" = now(), "actualizada_por" = $4, "edicion_local_seg" = $5
         WHERE "id_configuracion" = 1
         RETURNING "id_configuracion" AS id, "zona_horaria" AS "timeZone",
           to_char("hora_apertura", 'HH24:MI') AS "openingTime",
           to_char("hora_cierre", 'HH24:MI') AS "closingTime", "edicion_local_seg" AS "localOrderEditSeconds", "actualizada_en" AS "updatedAt"`,
      [
        input.timeZone,
        input.openingTime,
        input.closingTime,
        input.userId,
        input.localOrderEditSeconds,
      ],
    );
    return rows;
  }
  async getCurrentFindOperation(
    manager: EntityManager,
    input: { timeZone: string },
  ): Promise<GetCurrentFindOperationRow[]> {
    return manager.query<GetCurrentFindOperationRow[]>(
      `SELECT to_char(timezone($1, now())::date, 'YYYY-MM-DD') AS "businessDate"`,
      [input.timeZone],
    );
  }
  async getCurrentFindJornadaOperativa(
    manager: EntityManager,
    input: { businessDate: string },
  ): Promise<GetCurrentFindJornadaOperativaRow[]> {
    return manager.query<GetCurrentFindJornadaOperativaRow[]>(
      `SELECT j."id_jornada" AS id, j."fecha_operativa" AS "businessDate", j."estado" AS status,
          j."abierta_en" AS "openedAt", j."abierta_por" AS "openedBy"
       FROM "jornada_operativa" j WHERE j."fecha_operativa" = $1::date`,
      [input.businessDate],
    );
  }
  async getCurrentFindCaja(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetCurrentFindCajaRow[]> {
    return manager.query<GetCurrentFindCajaRow[]>(
      `SELECT c."id_caja" AS id, c."estado" AS status,
          c."monto_inicial_ctvs" AS "openingAmountCents", c."abierta_en" AS "openedAt",
          c."abierta_por" AS "openedBy", cc.id_cierre AS "closureId", cc.cerrado_en AS "closedAt",
          cc.cerrado_por AS "closedBy",cc.fondo_inicial_ctvs::float8 AS "closureOpeningCents",
          cc.ingresos_efectivo_ctvs::float8 AS "closureCashIncomeCents",cc.devoluciones_efectivo_ctvs::float8 AS "closureCashRefundsCents",
          cc.esperado_ctvs::float8 AS "expectedCents",cc.contado_ctvs::float8 AS "countedCents",
          cc.diferencia_ctvs::float8 AS "differenceCents",cc.justificacion AS "closureReason"
       FROM "caja" c LEFT JOIN cierre_caja cc ON cc.id_caja=c.id_caja WHERE c."id_jornada" = $1`,
      [input.id],
    );
  }
  async getCashSummaryFindPago(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<GetCashSummaryFindPagoRow[]> {
    return manager.query<GetCashSummaryFindPagoRow[]>(
      `SELECT c.id_caja AS "cashRegisterId",c.estado AS status,c.monto_inicial_ctvs::text AS opening,
        COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=c.id_caja AND p.metodo='cash' AND p.estado='confirmed'),0)::text AS income,
        COALESCE((SELECT sum(s.importe_ctvs) FROM salida_caja_devolucion s WHERE s.id_caja=c.id_caja),0)::text AS refunds,
        COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=c.id_caja AND p.metodo='transfer' AND p.estado='confirmed'),0)::text AS transfers,
        cc.id_cierre AS "closureId",cc.cerrado_en AS "closedAt",cc.cerrado_por AS "closedBy",
        cc.contado_ctvs::text AS counted,cc.diferencia_ctvs::text AS difference,cc.justificacion AS reason
       FROM caja c LEFT JOIN cierre_caja cc ON cc.id_caja=c.id_caja WHERE c.id_caja=$1`,
      [input.cashRegisterId],
    );
  }
  private async listCashRegistersFindCaja(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListCashRegistersFindCajaRow[]> {
    return manager.query<ListCashRegistersFindCajaRow[]>(
      `SELECT count(*)::int total FROM caja c WHERE ${fragment0}`,
      parameters,
    );
  }
  private async listCashRegistersFindCajaNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListCashRegistersFindCajaNextRow[]> {
    return manager.query<ListCashRegistersFindCajaNextRow[]>(
      `SELECT c.id_caja AS id,c.id_jornada AS "operatingDayId",c.estado AS status,
      c.monto_inicial_ctvs::float8 AS "openingCents",c.abierta_en AS "openedAt",c.abierta_por AS "openedBy",
      cc.id_cierre AS "closureId",cc.cerrado_en AS "closedAt",cc.cerrado_por AS "closedBy",
      cc.esperado_ctvs::float8 AS "expectedCents",cc.contado_ctvs::float8 AS "countedCents",cc.diferencia_ctvs::float8 AS "differenceCents"
      FROM caja c LEFT JOIN cierre_caja cc ON cc.id_caja=c.id_caja WHERE ${fragment0}
      ORDER BY c.abierta_en DESC,c.id_caja DESC LIMIT $3 OFFSET $4`,
      parameters,
    );
  }
  async getCashClosureFindCierreCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<GetCashClosureFindCierreCajaRow[]> {
    return manager.query<GetCashClosureFindCierreCajaRow[]>(
      `SELECT id_cierre AS id,id_caja AS "cashRegisterId",cerrado_por AS "closedBy",
      cerrado_en AS "closedAt",fondo_inicial_ctvs::float8 AS "openingCents",ingresos_efectivo_ctvs::float8 AS "cashIncomeCents",
      devoluciones_efectivo_ctvs::float8 AS "cashRefundsCents",esperado_ctvs::float8 AS "expectedCents",
      contado_ctvs::float8 AS "countedCents",diferencia_ctvs::float8 AS "differenceCents",justificacion AS reason,'USD' AS currency
      FROM cierre_caja WHERE id_caja=$1`,
      [input.cashRegisterId],
    );
  }
  async getCashClosureFindCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<GetCashClosureFindCajaRow[]> {
    return manager.query<GetCashClosureFindCajaRow[]>(
      'SELECT 1 FROM caja WHERE id_caja=$1',
      [input.cashRegisterId],
    );
  }
  async getCashClosingPreviewFindCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<GetCashClosingPreviewFindCajaRow[]> {
    return manager.query<GetCashClosingPreviewFindCajaRow[]>(
      `SELECT c.id_caja AS id,c.id_jornada AS day,c.estado AS status,
      c.monto_inicial_ctvs::text opening FROM caja c WHERE c.id_caja=$1`,
      [input.cashRegisterId],
    );
  }
  async closeCashFindCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<CloseCashFindCajaRow[]> {
    return manager.query<CloseCashFindCajaRow[]>(
      'SELECT id_jornada AS day FROM caja WHERE id_caja=$1',
      [input.cashRegisterId],
    );
  }
  async closeCashFindJornadaOperativa(
    manager: EntityManager,
    input: { day: string },
  ): Promise<void> {
    await manager.query(
      'SELECT estado FROM jornada_operativa WHERE id_jornada=$1 FOR UPDATE',
      [input.day],
    );
  }
  async closeCashFindCajaNext(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<CloseCashFindCajaNextRow[]> {
    return manager.query<CloseCashFindCajaNextRow[]>(
      `SELECT c.id_jornada AS day,c.estado AS status,c.monto_inicial_ctvs::text opening
          FROM caja c WHERE c.id_caja=$1 FOR UPDATE`,
      [input.cashRegisterId],
    );
  }
  async closeCashInsertCierreCaja(
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
    return manager.query<CloseCashInsertCierreCajaRow[]>(
      `INSERT INTO cierre_caja(id_caja,cerrado_por,fondo_inicial_ctvs,ingresos_efectivo_ctvs,
          devoluciones_efectivo_ctvs,esperado_ctvs,contado_ctvs,diferencia_ctvs,justificacion)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_cierre AS id,cerrado_en AS "closedAt"`,
      [
        input.cashRegisterId,
        input.userId,
        input.openingCents,
        input.cashIncomeCents,
        input.cashRefundsCents,
        input.expected,
        input.countedCents,
        input.difference,
        input.reason,
      ],
    );
  }
  async closeCashUpdateCaja(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<void> {
    await manager.query(`UPDATE caja SET estado='closed' WHERE id_caja=$1`, [
      input.cashRegisterId,
    ]);
  }

  async authorizeCashClosureFindRolPermiso(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizeCashClosureFindRolPermisoRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      'operations.closeCash',
    );
    return row ? [row] : [];
  }
  async cashSnapshotFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CashSnapshotFindPagoRow[]> {
    return manager.query<CashSnapshotFindPagoRow[]>(
      `SELECT COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=$1 AND p.metodo='cash' AND p.estado='confirmed'),0)::text income,
      COALESCE((SELECT sum(s.importe_ctvs) FROM salida_caja_devolucion s WHERE s.id_caja=$1),0)::text refunds,
      COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=$1 AND p.metodo='transfer' AND p.estado='confirmed'),0)::text transfers`,
      [input.id],
    );
  }
  private async closingBlockersFindOperation(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ClosingBlockersFindOperationRow[]> {
    return manager.query<ClosingBlockersFindOperationRow[]>(
      `SELECT count(*)::int AS total FROM (${fragment0}) AS blocker_rows`,
      parameters,
    );
  }
  private async closingBlockersLockOperation(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ClosingBlockersLockOperationRow[]> {
    return manager.query<ClosingBlockersLockOperationRow[]>(
      `${fragment0} LIMIT $2 OFFSET $3`,
      parameters,
    );
  }
  async pendingCashDayRefundsFindDevolucion(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<PendingCashDayRefundsFindDevolucionRow[]> {
    return manager.query<PendingCashDayRefundsFindDevolucionRow[]>(
      `SELECT count(*)::int total,COALESCE(sum(d.importe_ctvs),0)::text AS "amountCents"
      FROM devolucion d JOIN pago p ON p.id_pago=d.id_pago JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion
      WHERE l.id_caja IN(SELECT id_caja FROM caja WHERE id_jornada=$1) AND d.estado='pending'`,
      [input.dayId],
    );
  }
  async getCashClosureWithFindCierreCaja(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetCashClosureWithFindCierreCajaRow[]> {
    return manager.query<GetCashClosureWithFindCierreCajaRow[]>(
      `SELECT id_cierre AS id,id_caja AS "cashRegisterId",cerrado_por AS "closedBy",cerrado_en AS "closedAt",
      fondo_inicial_ctvs::float8 AS "openingCents",ingresos_efectivo_ctvs::float8 AS "cashIncomeCents",devoluciones_efectivo_ctvs::float8 AS "cashRefundsCents",
      esperado_ctvs::float8 AS "expectedCents",contado_ctvs::float8 AS "countedCents",diferencia_ctvs::float8 AS "differenceCents",justificacion AS reason,'USD' AS currency
      FROM cierre_caja WHERE id_caja=$1`,
      [input.id],
    );
  }
  async openDayInsertJornadaOperativa(
    manager: EntityManager,
    input: { timeZone: string; userId: string },
  ): Promise<OpenDayInsertJornadaOperativaRow[]> {
    return manager.query<OpenDayInsertJornadaOperativaRow[]>(
      `INSERT INTO "jornada_operativa" ("fecha_operativa", "estado", "abierta_por")
           VALUES (timezone($1, now())::date, 'open', $2)
           RETURNING "id_jornada" AS id, "fecha_operativa" AS "businessDate", "estado" AS status,
             "abierta_en" AS "openedAt", "abierta_por" AS "openedBy"`,
      [input.timeZone, input.userId],
    );
  }
  async openCashFindJornadaOperativa(
    manager: EntityManager,
    input: { timeZone: string },
  ): Promise<OpenCashFindJornadaOperativaRow[]> {
    return manager.query<OpenCashFindJornadaOperativaRow[]>(
      `SELECT "id_jornada" AS id FROM "jornada_operativa"
           WHERE "fecha_operativa" = timezone($1, now())::date AND "estado" = 'open' FOR UPDATE`,
      [input.timeZone],
    );
  }
  async openCashInsertCaja(
    manager: EntityManager,
    input: { id: string; openingAmountCents: number; userId: string },
  ): Promise<OpenCashInsertCajaRow[]> {
    return manager.query<OpenCashInsertCajaRow[]>(
      `INSERT INTO "caja" ("id_jornada", "estado", "monto_inicial_ctvs", "abierta_por")
           VALUES ($1, 'open', $2, $3)
           RETURNING "id_caja" AS id, "estado" AS status, "monto_inicial_ctvs" AS "openingAmountCents",
             "abierta_en" AS "openedAt", "abierta_por" AS "openedBy"`,
      [input.id, input.openingAmountCents, input.userId],
    );
  }
  async getSettingsWithFindConfiguracionOperativa(
    manager: EntityManager,
  ): Promise<GetSettingsWithFindConfiguracionOperativaRow[]> {
    return manager.query<GetSettingsWithFindConfiguracionOperativaRow[]>(
      `SELECT "id_configuracion" AS id, "zona_horaria" AS "timeZone",
        to_char("hora_apertura", 'HH24:MI') AS "openingTime",
        to_char("hora_cierre", 'HH24:MI') AS "closingTime", "edicion_local_seg" AS "localOrderEditSeconds", "actualizada_en" AS "updatedAt"
       FROM "configuracion_operativa" WHERE "id_configuracion" = 1 FOR UPDATE`,
      [],
    );
  }
  async lockOperationsFindOperation(manager: EntityManager): Promise<void> {
    await new OperationalLockRepository().acquire(manager);
  }

  async listCashRegisters(manager: EntityManager, query: ListCashRegistersDto) {
    const where = `($1::text IS NULL OR c.estado=$1) AND ($2::uuid IS NULL OR c.id_jornada=$2)`;
    const args = [query.status ?? null, query.operatingDayId ?? null];
    const [{ total }] = await this.listCashRegistersFindCaja(
      manager,
      args,
      where,
    );
    const rows = await this.listCashRegistersFindCajaNext(
      manager,
      [...args, query.limit, (query.page - 1) * query.limit],
      where,
    );
    return { items: rows, total, page: query.page, limit: query.limit };
  }

  async closingBlockers(
    manager: EntityManager,
    cashId: string,
    dayId: string,
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
      const [{ total: count }] = await this.closingBlockersFindOperation(
        manager,
        args,
        sql,
      );
      const rows = await this.closingBlockersLockOperation(
        manager,
        [...args, limit, (page - 1) * limit],
        sql,
      );
      blockers[q.key] = {
        items: rows.map((row) => ({
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
}
