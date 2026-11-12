import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';
import type { EntityManager } from 'typeorm';

export interface OperatingDayRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
  closedAt: Date | null;
  closedBy: string | null;
  closureId: string | null;
  cashRegisterId: string | null;
  cashStatus: string | null;
  cashClosureId: string | null;
}

export interface OperatingDayClosureRow {
  id: string;
  operatingDayId: string;
  cashClosureId: string | null;
  closedBy: string;
  closedAt: Date;
  notes: string | null;
  summary: Record<string, number>;
}

export interface OperatingDayBlockerRow {
  kind: string;
  id: string;
  reason: string;
}

export interface OperatingDayCountsRow {
  openCash: number;
  cashWithoutClosure: number;
  unfinishedOrders: number;
  unsettledConsumption: number;
  pendingSettlements: number;
  pendingTransfers: number;
  pendingCancellations: number;
  activeOrderReservations: number;
}

export interface OperatingDayCleanupCountsRow {
  pendingRedemptions: number;
  pendingParticipants: number;
  approvedParticipants: number;
  openVisits: number;
  unusedDeliveryRequests: number;
}

export interface OpenOperatingDayRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
}

export interface AuthorizedOperatingActionRow {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}

export class OperatingDaysRepository {
  async findDay(
    manager: EntityManager,
    id: string,
  ): Promise<OperatingDayRow | undefined> {
    const [row] = await manager.query<OperatingDayRow[]>(
      `SELECT j.id_jornada AS id,j.fecha_operativa::text AS "businessDate",j.estado AS status,
       j.abierta_en AS "openedAt",j.abierta_por AS "openedBy",cj.id_cierre AS "closureId",
       cj.cerrado_en AS "closedAt",cj.cerrado_por AS "closedBy",c.id_caja AS "cashRegisterId",
       c.estado AS "cashStatus",cc.id_cierre AS "cashClosureId"
       FROM jornada_operativa j LEFT JOIN cierre_jornada cj ON cj.id_jornada=j.id_jornada
       LEFT JOIN caja c ON c.id_jornada=j.id_jornada LEFT JOIN cierre_caja cc ON cc.id_caja=c.id_caja
       WHERE j.id_jornada=$1`,
      [id],
    );
    return row;
  }

  async findClosure(
    manager: EntityManager,
    id: string,
  ): Promise<OperatingDayClosureRow | undefined> {
    const [row] = await manager.query<OperatingDayClosureRow[]>(
      `SELECT id_cierre AS id,id_jornada AS "operatingDayId",id_cierre_caja AS "cashClosureId",
       cerrado_por AS "closedBy",cerrado_en AS "closedAt",observaciones AS notes,resumen AS summary
       FROM cierre_jornada WHERE id_jornada=$1`,
      [id],
    );
    return row;
  }

  async findDayForUpdate(
    manager: EntityManager,
    id: string,
  ): Promise<{ id: string; status: string } | undefined> {
    const [row] = await manager.query<Array<{ id: string; status: string }>>(
      `SELECT id_jornada AS id,estado AS status FROM jornada_operativa WHERE id_jornada=$1 FOR UPDATE`,
      [id],
    );
    return row;
  }

  async findOpenDayIds(
    manager: EntityManager,
    timeZone: string,
  ): Promise<Array<{ id: string; businessDate: string }>> {
    return manager.query<Array<{ id: string; businessDate: string }>>(
      `SELECT id_jornada AS id,fecha_operativa::text AS "businessDate" FROM jornada_operativa
       WHERE estado='open' AND fecha_operativa < timezone($1,clock_timestamp())::date
       ORDER BY fecha_operativa,id_jornada FOR UPDATE`,
      [timeZone],
    );
  }

  async findCurrentDay(
    manager: EntityManager,
    timeZone: string,
  ): Promise<Array<{ id: string }>> {
    return manager.query<Array<{ id: string }>>(
      `SELECT id_jornada AS id FROM jornada_operativa WHERE fecha_operativa=timezone($1,clock_timestamp())::date FOR UPDATE`,
      [timeZone],
    );
  }

  async insertExceptionOpening(
    manager: EntityManager,
    input: {
      timeZone: string;
      userId: string;
      reason: string;
      previousDayIds: string[];
    },
  ): Promise<OpenOperatingDayRow> {
    const [day] = await manager.query<OpenOperatingDayRow[]>(
      `INSERT INTO jornada_operativa(fecha_operativa,estado,abierta_por)
       VALUES(timezone($1,clock_timestamp())::date,'open',$2)
       RETURNING id_jornada AS id,fecha_operativa::text AS "businessDate",estado AS status,abierta_en AS "openedAt",abierta_por AS "openedBy"`,
      [input.timeZone, input.userId],
    );
    await manager.query(
      `INSERT INTO apertura_excepcional_jornada(id_jornada,abierta_por,motivo,jornadas_pendientes)
       VALUES($1,$2,$3,$4::uuid[])`,
      [day.id, input.userId, input.reason, input.previousDayIds],
    );
    return day;
  }

  async closeDayRole(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizedOperatingActionRow | undefined> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      'operations.closeDay',
    );
    return row;
  }

  async exceptionOpeningRole(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizedOperatingActionRow | undefined> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      'operations.openWithPendingDays',
    );
    return row;
  }

  async blockers(
    manager: EntityManager,
    dayId: string,
    page: number,
    limit: number,
  ): Promise<{ items: OperatingDayBlockerRow[]; total: number }> {
    const ctes = this.blockerCtes();
    const [{ total }] = await manager.query<Array<{ total: number }>>(
      `${ctes} SELECT count(*)::int AS total FROM blockers`,
      [dayId],
    );
    const items = await manager.query<OperatingDayBlockerRow[]>(
      `${ctes} SELECT kind,id,reason FROM blockers ORDER BY kind,id LIMIT $2 OFFSET $3`,
      [dayId, limit, (page - 1) * limit],
    );
    return { items, total };
  }

  async blockerCounts(
    manager: EntityManager,
    dayId: string,
  ): Promise<OperatingDayCountsRow> {
    const [row] = await manager.query<OperatingDayCountsRow[]>(
      `SELECT
       (SELECT count(*) FROM caja WHERE id_jornada=$1 AND estado='open')::int AS "openCash",
       (SELECT count(*) FROM caja c WHERE c.id_jornada=$1 AND NOT EXISTS(SELECT 1 FROM cierre_caja cc WHERE cc.id_caja=c.id_caja))::int AS "cashWithoutClosure",
       (SELECT count(*) FROM pedido WHERE id_jornada=$1 AND estado NOT IN ('delivered','cancelled'))::int AS "unfinishedOrders",
       (SELECT count(DISTINCT c.id_cuenta) FROM cuenta_consumo c WHERE c.id_jornada=$1 AND EXISTS(SELECT 1 FROM asignacion_consumo a WHERE a.id_cuenta=c.id_cuenta AND a.estado='active' AND NOT EXISTS(SELECT 1 FROM detalle_liquidacion d JOIN liquidacion l ON l.id_liquidacion=d.id_liquidacion WHERE d.id_asignacion=a.id_asignacion AND d.vigente AND l.estado='settled')))::int AS "unsettledConsumption",
       (SELECT count(*) FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE c.id_jornada=$1 AND l.estado='pending')::int AS "pendingSettlements",
       (SELECT count(*) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE c.id_jornada=$1 AND p.estado='pendingVerification')::int AS "pendingTransfers",
       (SELECT count(*) FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido WHERE o.id_jornada=$1 AND s.estado='pending')::int AS "pendingCancellations",
       (SELECT count(DISTINCT o.id_pedido) FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido JOIN detalle_pedido d ON d.id_version=v.id_version JOIN reserva_inventario r ON r.id_detalle=d.id_detalle AND r.estado='active' WHERE o.id_jornada=$1)::int AS "activeOrderReservations"`,
      [dayId],
    );
    return row;
  }

  async cleanupCounts(
    manager: EntityManager,
    dayId: string,
  ): Promise<OperatingDayCleanupCountsRow> {
    const [row] = await manager.query<OperatingDayCleanupCountsRow[]>(
      `SELECT
       (SELECT count(*) FROM solicitud_canje WHERE id_jornada=$1 AND estado='pending')::int AS "pendingRedemptions",
       (SELECT count(*) FROM participante p JOIN visita_mesa v ON v.id_visita=p.id_visita WHERE v.id_jornada=$1 AND p.estado='pending')::int AS "pendingParticipants",
       (SELECT count(*) FROM participante p JOIN visita_mesa v ON v.id_visita=p.id_visita WHERE v.id_jornada=$1 AND p.estado='approved')::int AS "approvedParticipants",
       (SELECT count(*) FROM visita_mesa WHERE id_jornada=$1 AND estado='open')::int AS "openVisits",
       (SELECT count(*) FROM solicitud_domicilio s WHERE s.id_jornada=$1 AND s.estado IN ('pending','approved') AND NOT EXISTS(SELECT 1 FROM entrega_domicilio e WHERE e.id_solicitud=s.id_solicitud))::int AS "unusedDeliveryRequests"`,
      [dayId],
    );
    return row;
  }

  async pendingRefunds(
    manager: EntityManager,
    dayId: string,
  ): Promise<{ total: number; amountCents: string }> {
    const [row] = await manager.query<
      Array<{ total: number; amountCents: string }>
    >(
      `SELECT count(*)::int AS total,COALESCE(sum(d.importe_ctvs),0)::text AS "amountCents"
       FROM devolucion d JOIN pago p ON p.id_pago=d.id_pago JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion
       JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE c.id_jornada=$1 AND d.estado='pending'`,
      [dayId],
    );
    return row;
  }

  async lockDayResources(manager: EntityManager, dayId: string): Promise<void> {
    await manager.query(
      `SELECT id_caja FROM caja WHERE id_jornada=$1 ORDER BY id_caja FOR UPDATE`,
      [dayId],
    );
    await manager.query(
      `SELECT id_cuenta FROM cuenta_consumo WHERE id_jornada=$1 ORDER BY id_cuenta FOR UPDATE`,
      [dayId],
    );
    await manager.query(
      `SELECT o.id_pedido FROM pedido o WHERE o.id_jornada=$1 ORDER BY o.id_pedido FOR UPDATE`,
      [dayId],
    );
    await manager.query(
      `SELECT v.id_visita FROM visita_mesa v JOIN mesa m ON m.id_mesa=v.id_mesa WHERE v.id_jornada=$1 ORDER BY m.id_mesa,v.id_visita FOR UPDATE OF m,v`,
      [dayId],
    );
  }

  async assertNoReservations(
    manager: EntityManager,
    dayId: string,
  ): Promise<boolean> {
    const [row] = await manager.query<Array<{ remains: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM solicitud_canje r JOIN reserva_puntos_canje p ON p.id_canje=r.id_canje WHERE r.id_jornada=$1 AND p.estado='active')
       OR EXISTS(SELECT 1 FROM solicitud_canje r JOIN reserva_inventario_canje i ON i.id_canje=r.id_canje WHERE r.id_jornada=$1 AND i.estado='active')
       OR EXISTS(SELECT 1 FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido JOIN detalle_pedido d ON d.id_version=v.id_version JOIN reserva_inventario r ON r.id_detalle=d.id_detalle WHERE o.id_jornada=$1 AND r.estado='active') AS remains`,
      [dayId],
    );
    return row.remains;
  }

  async insertClosure(
    manager: EntityManager,
    input: {
      dayId: string;
      cashClosureId: string | null;
      userId: string;
      notes: string | null;
      summary: Record<string, number>;
    },
  ): Promise<OperatingDayClosureRow> {
    const [row] = await manager.query<OperatingDayClosureRow[]>(
      `INSERT INTO cierre_jornada(id_jornada,id_cierre_caja,cerrado_por,observaciones,resumen)
       VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id_cierre AS id,id_jornada AS "operatingDayId",
       id_cierre_caja AS "cashClosureId",cerrado_por AS "closedBy",cerrado_en AS "closedAt",observaciones AS notes,resumen AS summary`,
      [
        input.dayId,
        input.cashClosureId,
        input.userId,
        input.notes,
        JSON.stringify(input.summary),
      ],
    );
    return row;
  }

  async closeDay(manager: EntityManager, dayId: string): Promise<void> {
    await manager.query(
      `UPDATE jornada_operativa SET estado='closed' WHERE id_jornada=$1`,
      [dayId],
    );
  }

  private blockerCtes(): string {
    return `WITH blockers AS (
      SELECT 'openCash'::text kind,c.id_caja::text id,'La caja de la jornada sigue abierta.'::text reason FROM caja c WHERE c.id_jornada=$1 AND c.estado='open'
      UNION ALL SELECT 'cashWithoutClosure',c.id_caja::text,'La caja cerrada no tiene conciliación.' FROM caja c WHERE c.id_jornada=$1 AND NOT EXISTS(SELECT 1 FROM cierre_caja cc WHERE cc.id_caja=c.id_caja)
      UNION ALL SELECT 'unfinishedOrders',o.id_pedido::text,'El pedido no está entregado ni cancelado.' FROM pedido o WHERE o.id_jornada=$1 AND o.estado NOT IN ('delivered','cancelled')
      UNION ALL SELECT 'unsettledConsumption',c.id_cuenta::text,'La cuenta tiene consumo sin liquidación resuelta.' FROM cuenta_consumo c WHERE c.id_jornada=$1 AND EXISTS(SELECT 1 FROM asignacion_consumo a WHERE a.id_cuenta=c.id_cuenta AND a.estado='active' AND NOT EXISTS(SELECT 1 FROM detalle_liquidacion d JOIN liquidacion l ON l.id_liquidacion=d.id_liquidacion WHERE d.id_asignacion=a.id_asignacion AND d.vigente AND l.estado='settled'))
      UNION ALL SELECT 'pendingSettlements',l.id_liquidacion::text,'La cuenta tiene una liquidación pendiente.' FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE c.id_jornada=$1 AND l.estado='pending'
      UNION ALL SELECT 'pendingTransfers',p.id_pago::text,'La transferencia espera verificación.' FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE c.id_jornada=$1 AND p.estado='pendingVerification'
      UNION ALL SELECT 'pendingCancellations',s.id_solicitud::text,'La solicitud de cancelación espera decisión.' FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido WHERE o.id_jornada=$1 AND s.estado='pending'
      UNION ALL SELECT DISTINCT 'activeOrderReservations',o.id_pedido::text,'El pedido conserva reservas de inventario activas.' FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido JOIN detalle_pedido d ON d.id_version=v.id_version JOIN reserva_inventario r ON r.id_detalle=d.id_detalle AND r.estado='active' WHERE o.id_jornada=$1
    )`;
  }
}
