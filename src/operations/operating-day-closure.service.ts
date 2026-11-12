import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CancellationRequest } from '../cancellations/entities/cancellation-request.entity.js';
import { CashClosure } from '../cash/entities/cash-closure.entity.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { TransactionLocksService } from '../common/transactions/transaction-locks.service.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { InventoryReservation } from '../orders/entities/inventory-reservation.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { OrderVersion } from '../orders/entities/order-version.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { RedemptionReservationsService } from '../redemptions/redemption-reservations.service.js';
import { Refund } from '../refunds/entities/refund.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { RestaurantTable } from '../tables/entities/restaurant-table.entity.js';
import { TableVisit } from '../visits/entities/table-visit.entity.js';
import { type CloseOperatingDayDto } from './dto/close-operating-day.dto.js';
import { type OperatingDayPreviewQueryDto } from './dto/operating-day-preview-query.dto.js';
import { OperatingDayClosure } from './entities/operating-day-closure.entity.js';
import { OperatingDay } from './entities/operating-day.entity.js';
import {
  AuthorizedOperatingActionRow,
  OperatingDayBlockerRow,
  OperatingDayCleanupCountsRow,
  OperatingDayClosureRow,
  OperatingDayCountsRow,
  OperatingDayRow,
} from './types/operating-days.types.js';

@Injectable()
export class OperatingDayClosureService {
  constructor(
    @InjectRepository(OperatingDay)
    private readonly records: Repository<OperatingDay>,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly rewards: RedemptionReservationsService,
    private readonly participants: ParticipantsService,
    private readonly delivery: DeliveryService,
    private readonly auditRecords: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly locks: TransactionLocksService,
  ) {}

  async getOperatingDayClosure(id: string) {
    const day = await this.findDay(this.records.manager, id);
    if (!day) throw new NotFoundException('Jornada no encontrada.');
    const closure = await this.findClosure(this.records.manager, id);
    if (!closure)
      throw new NotFoundException('La jornada todavía no tiene cierre.');
    return { ...closure, currency: 'USD' as const };
  }

  async getOperatingDayClosingPreview(
    id: string,
    query: OperatingDayPreviewQueryDto,
  ) {
    const day = await this.findDay(this.records.manager, id);
    if (!day) throw new NotFoundException('Jornada no encontrada.');
    const [counts, blockers, cleanupActions, pendingRefunds] =
      await Promise.all([
        this.blockerCounts(this.records.manager, id),
        this.blockers(this.records.manager, id, query.page, query.limit),
        this.cleanupCounts(this.records.manager, id),
        this.pendingOperatingDayRefunds(this.records.manager, id),
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
        const day = await this.findDayForUpdate(manager, id);
        if (!day) throw new NotFoundException('Jornada no encontrada.');
        if (day.status !== 'open')
          throw new ConflictException('La jornada ya está cerrada.');
        await this.lockDayResources(manager, id);
        const blockers = await this.blockers(manager, id, 1, 1);
        if (blockers.total)
          throw new ConflictException(
            'Resuelve los pendientes de la jornada antes de cerrarla.',
          );

        const before = await this.cleanupCounts(manager, id);
        await this.rewards.releaseForOperatingDay(
          manager,
          id,
          'redemption.day_closed',
        );
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
        if (await this.assertNoReservations(manager, id))
          throw new ConflictException(
            'Quedaron reservas de canje sin resolver; el cierre se revirtió.',
          );

        const current = await this.findDay(manager, id);
        const summary: Record<string, number> = {
          ...before,
          ...visitCleanup,
          cancelledDeliveryRequests,
          pendingRefunds: pendingRefunds.total,
          pendingRefundAmountCents: pendingRefunds.amountCents,
        };
        const closure = await this.insertClosure(manager, {
          dayId: id,
          cashClosureId: current?.cashClosureId ?? null,
          userId: actor.userId,
          notes: dto.notes ?? null,
          summary,
        });
        await this.closeDay(manager, id);
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
        ? await this.closeDayRole(manager, {
            userId: actor.userId,
            sessionId: actor.sessionId,
          })
        : await this.exceptionOpeningRole(manager, {
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
    const row = await this.pendingRefunds(manager, dayId);
    const amount = BigInt(row.amountCents);
    if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ConflictException(
        'Las devoluciones pendientes exceden el rango seguro.',
      );
    return { total: row.total, amountCents: Number(amount) };
  }

  private async lockOperations(manager: import('typeorm').EntityManager) {
    await this.lockOperationsFindOperation(manager);
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

  private async findClosure(
    manager: EntityManager,
    id: string,
  ): Promise<OperatingDayClosureRow | undefined> {
    const [row] = await manager
      .getRepository(OperatingDayClosure)
      .createQueryBuilder('cierre_jornada')
      .select([
        'id_cierre AS id',
        'id_jornada AS "operatingDayId"',
        'id_cierre_caja AS "cashClosureId"',
        'cerrado_por AS "closedBy"',
        'cerrado_en AS "closedAt"',
        'observaciones AS notes',
        'resumen AS summary',
      ])
      .where('id_jornada=:id')
      .setParameters({ id })
      .getRawMany();
    return row;
  }

  private async findDayForUpdate(
    manager: EntityManager,
    id: string,
  ): Promise<{ id: string; status: string } | undefined> {
    const [row] = await manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select(['id_jornada AS id', 'estado AS status'])
      .where('id_jornada=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id })
      .getRawMany();
    return row;
  }

  private async closeDayRole(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizedOperatingActionRow | undefined> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
      'operations.closeDay',
    );
    return row;
  }

  private async exceptionOpeningRole(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizedOperatingActionRow | undefined> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
      'operations.openWithPendingDays',
    );
    return row;
  }

  private async blockers(
    manager: EntityManager,
    dayId: string,
    page: number,
    limit: number,
  ): Promise<{ items: OperatingDayBlockerRow[]; total: number }> {
    const queries = [
      {
        kind: 'openCash',
        id: 'c.id_caja',
        reason: 'La caja de la jornada sigue abierta.',
        query: manager
          .getRepository(CashRegister)
          .createQueryBuilder('c')
          .where("c.id_jornada=:day AND c.estado='open'"),
      },
      {
        kind: 'cashWithoutClosure',
        id: 'c.id_caja',
        reason: 'La caja no tiene conciliación.',
        query: manager
          .getRepository(CashRegister)
          .createQueryBuilder('c')
          .where(
            'c.id_jornada=:day AND NOT EXISTS(SELECT 1 FROM cierre_caja cc WHERE cc.id_caja=c.id_caja)',
          ),
      },
      {
        kind: 'unfinishedOrders',
        id: 'o.id_pedido',
        reason: 'El pedido no está entregado ni cancelado.',
        query: manager
          .getRepository(Order)
          .createQueryBuilder('o')
          .where(
            "o.id_jornada=:day AND o.estado NOT IN ('delivered','cancelled')",
          ),
      },
      {
        kind: 'unsettledConsumption',
        id: 'c.id_cuenta',
        reason: 'La cuenta tiene consumo sin liquidación resuelta.',
        query: manager
          .getRepository(ConsumptionAccount)
          .createQueryBuilder('c')
          .where(
            "c.id_jornada=:day AND EXISTS(SELECT 1 FROM asignacion_consumo a WHERE a.id_cuenta=c.id_cuenta AND a.estado='active' AND NOT EXISTS(SELECT 1 FROM detalle_liquidacion d JOIN liquidacion l ON l.id_liquidacion=d.id_liquidacion WHERE d.id_asignacion=a.id_asignacion AND d.vigente AND l.estado='settled'))",
          ),
      },
      {
        kind: 'pendingSettlements',
        id: 'l.id_liquidacion',
        reason: 'La cuenta tiene una liquidación pendiente.',
        query: manager
          .getRepository(Settlement)
          .createQueryBuilder('l')
          .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
          .where("c.id_jornada=:day AND l.estado='pending'"),
      },
      {
        kind: 'pendingTransfers',
        id: 'p.id_pago',
        reason: 'La transferencia espera verificación.',
        query: manager
          .getRepository(Payment)
          .createQueryBuilder('p')
          .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
          .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
          .where("c.id_jornada=:day AND p.estado='pendingVerification'"),
      },
      {
        kind: 'pendingCancellations',
        id: 's.id_solicitud',
        reason: 'La solicitud de cancelación espera decisión.',
        query: manager
          .getRepository(CancellationRequest)
          .createQueryBuilder('s')
          .innerJoin(Order, 'o', 'o.id_pedido=s.id_pedido')
          .where("o.id_jornada=:day AND s.estado='pending'"),
      },
      {
        kind: 'activeOrderReservations',
        id: 'o.id_pedido',
        reason: 'El pedido conserva reservas de inventario activas.',
        query: manager
          .getRepository(Order)
          .createQueryBuilder('o')
          .innerJoin(OrderVersion, 'v', 'v.id_pedido=o.id_pedido')
          .innerJoin(OrderItem, 'd', 'd.id_version=v.id_version')
          .innerJoin(
            InventoryReservation,
            'r',
            "r.id_detalle=d.id_detalle AND r.estado='active'",
          )
          .where('o.id_jornada=:day'),
      },
    ].sort((a, b) => a.kind.localeCompare(b.kind, 'en'));
    let total = 0,
      skip = (page - 1) * limit;
    const items: OperatingDayBlockerRow[] = [];
    for (const group of queries) {
      group.query.setParameter('day', dayId);
      const count = Number(
        (
          await group.query
            .clone()
            .select('count(DISTINCT ' + group.id + ')::int', 'total')
            .getRawOne<{ total: number }>()
        )?.total ?? 0,
      );
      total += count;
      if (skip >= count) {
        skip -= count;
        continue;
      }
      if (items.length < limit) {
        const rows = await group.query
          .clone()
          .select(group.id, 'id')
          .distinct(true)
          .orderBy(group.id)
          .offset(skip)
          .limit(limit - items.length)
          .getRawMany<{ id: string }>();
        items.push(
          ...rows.map((row) => ({
            kind: group.kind,
            id: row.id,
            reason: group.reason,
          })),
        );
      }
      skip = 0;
    }
    return { items, total };
  }

  private async blockerCounts(
    manager: EntityManager,
    dayId: string,
  ): Promise<OperatingDayCountsRow> {
    const [row] = await manager
      .createQueryBuilder()
      .select([
        '(SELECT count(*) FROM caja WHERE id_jornada=:dayId AND estado=\'open\')::int AS "openCash"',
        '(SELECT count(*) FROM caja c WHERE c.id_jornada=:dayId AND NOT EXISTS(SELECT 1 FROM cierre_caja cc WHERE cc.id_caja=c.id_caja))::int AS "cashWithoutClosure"',
        "(SELECT count(*) FROM pedido WHERE id_jornada=:dayId AND estado NOT IN ('delivered','cancelled'))::int AS \"unfinishedOrders\"",
        "(SELECT count(DISTINCT c.id_cuenta) FROM cuenta_consumo c WHERE c.id_jornada=:dayId AND EXISTS(SELECT 1 FROM asignacion_consumo a WHERE a.id_cuenta=c.id_cuenta AND a.estado='active' AND NOT EXISTS(SELECT 1 FROM detalle_liquidacion d JOIN liquidacion l ON l.id_liquidacion=d.id_liquidacion WHERE d.id_asignacion=a.id_asignacion AND d.vigente AND l.estado='settled')))::int AS \"unsettledConsumption\"",
        '(SELECT count(*) FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE c.id_jornada=:dayId AND l.estado=\'pending\')::int AS "pendingSettlements"',
        '(SELECT count(*) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE c.id_jornada=:dayId AND p.estado=\'pendingVerification\')::int AS "pendingTransfers"',
        '(SELECT count(*) FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido WHERE o.id_jornada=:dayId AND s.estado=\'pending\')::int AS "pendingCancellations"',
        '(SELECT count(DISTINCT o.id_pedido) FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido JOIN detalle_pedido d ON d.id_version=v.id_version JOIN reserva_inventario r ON r.id_detalle=d.id_detalle AND r.estado=\'active\' WHERE o.id_jornada=:dayId)::int AS "activeOrderReservations"',
      ])
      .from('(SELECT 1)', '_singleton')
      .setParameters({ dayId })
      .getRawMany();
    return row;
  }

  private async cleanupCounts(
    manager: EntityManager,
    dayId: string,
  ): Promise<OperatingDayCleanupCountsRow> {
    const [row] = await manager
      .createQueryBuilder()
      .select([
        '(SELECT count(*) FROM solicitud_canje WHERE id_jornada=:dayId AND estado=\'pending\')::int AS "pendingRedemptions"',
        '(SELECT count(*) FROM participante p JOIN visita_mesa v ON v.id_visita=p.id_visita WHERE v.id_jornada=:dayId AND p.estado=\'pending\')::int AS "pendingParticipants"',
        '(SELECT count(*) FROM participante p JOIN visita_mesa v ON v.id_visita=p.id_visita WHERE v.id_jornada=:dayId AND p.estado=\'approved\')::int AS "approvedParticipants"',
        '(SELECT count(*) FROM visita_mesa WHERE id_jornada=:dayId AND estado=\'open\')::int AS "openVisits"',
        "(SELECT count(*) FROM solicitud_domicilio s WHERE s.id_jornada=:dayId AND s.estado IN ('pending','approved') AND NOT EXISTS(SELECT 1 FROM entrega_domicilio e WHERE e.id_solicitud=s.id_solicitud))::int AS \"unusedDeliveryRequests\"",
      ])
      .from('(SELECT 1)', '_singleton')
      .setParameters({ dayId })
      .getRawMany();
    return row;
  }

  private async pendingRefunds(
    manager: EntityManager,
    dayId: string,
  ): Promise<{ total: number; amountCents: string }> {
    const [row] = await manager
      .getRepository(Refund)
      .createQueryBuilder('d')
      .select([
        'count(*)::int AS total',
        'COALESCE(sum(d.importe_ctvs),0)::text AS "amountCents"',
      ])
      .innerJoin(Payment, 'p', 'p.id_pago=d.id_pago')
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .where("c.id_jornada=:dayId AND d.estado='pending'")
      .setParameters({ dayId })
      .getRawMany();
    return row;
  }

  private async lockDayResources(
    manager: EntityManager,
    dayId: string,
  ): Promise<void> {
    await manager
      .getRepository(CashRegister)
      .createQueryBuilder('caja')
      .select('id_caja AS "id_caja"')
      .where('id_jornada=:dayId')
      .addOrderBy('id_caja', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ dayId })
      .getRawMany();

    await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('cuenta_consumo')
      .select('id_cuenta AS "id_cuenta"')
      .where('id_jornada=:dayId')
      .addOrderBy('id_cuenta', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ dayId })
      .getRawMany();

    await manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('o.id_pedido AS "id_pedido"')
      .where('o.id_jornada=:dayId')
      .addOrderBy('o.id_pedido', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ dayId })
      .getRawMany();

    await manager
      .getRepository(TableVisit)
      .createQueryBuilder('v')
      .select('v.id_visita AS "id_visita"')
      .innerJoin(RestaurantTable, 'm', 'm.id_mesa=v.id_mesa')
      .where('v.id_jornada=:dayId')
      .addOrderBy('m.id_mesa', 'ASC')
      .addOrderBy('v.id_visita', 'ASC')
      .setLock('pessimistic_write', undefined, ['m', 'v'])
      .setParameters({ dayId })
      .getRawMany();
  }

  private async assertNoReservations(
    manager: EntityManager,
    dayId: string,
  ): Promise<boolean> {
    const [row] = await manager
      .createQueryBuilder()
      .select(
        "EXISTS(SELECT 1 FROM solicitud_canje r JOIN reserva_puntos_canje p ON p.id_canje=r.id_canje WHERE r.id_jornada=:dayId AND p.estado='active')\n       OR EXISTS(SELECT 1 FROM solicitud_canje r JOIN reserva_inventario_canje i ON i.id_canje=r.id_canje WHERE r.id_jornada=:dayId AND i.estado='active')\n       OR EXISTS(SELECT 1 FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido JOIN detalle_pedido d ON d.id_version=v.id_version JOIN reserva_inventario r ON r.id_detalle=d.id_detalle WHERE o.id_jornada=:dayId AND r.estado='active') AS remains",
      )
      .from('(SELECT 1)', '_singleton')
      .setParameters({ dayId })
      .getRawMany();
    return row.remains;
  }

  private async insertClosure(
    manager: EntityManager,
    input: {
      dayId: string;
      cashClosureId: string | null;
      userId: string;
      notes: string | null;
      summary: Record<string, number>;
    },
  ): Promise<OperatingDayClosureRow> {
    const [row] = await manager
      .getRepository(OperatingDayClosure)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_jornada: input.dayId,
          id_cierre_caja: input.cashClosureId,
          cerrado_por: input.userId,
          observaciones: input.notes,
          resumen: () => ':value5::jsonb',
        },
      ])
      .returning(
        'id_cierre AS id,id_jornada AS "operatingDayId",\n       id_cierre_caja AS "cashClosureId",cerrado_por AS "closedBy",cerrado_en AS "closedAt",observaciones AS notes,resumen AS summary',
      )
      .setParameters({ value5: JSON.stringify(input.summary) })
      .execute()
      .then((result) => result.raw);
    return row;
  }

  private async closeDay(manager: EntityManager, dayId: string): Promise<void> {
    await manager
      .getRepository(OperatingDay)
      .createQueryBuilder()
      .update(OperatingDay)
      .set({ estado: 'closed' })
      .where('id_jornada=:dayId')
      .setParameters({ dayId })
      .execute();
  }
}
