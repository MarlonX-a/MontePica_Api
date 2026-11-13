import { forEachSequential } from '../common/async/for-each-sequential.js';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { ConsumptionAssignment } from '../accounts/entities/consumption-assignment.entity.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CancellationRequest } from '../cancellations/entities/cancellation-request.entity.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { type SettlementListDto } from './dto/settlement-list.dto.js';
import { SettlementItem } from './entities/settlement-item.entity.js';
import { Settlement } from './entities/settlement.entity.js';
import {
  AuthorizeFindUsuarioNextRow,
  AuthorizeFindUsuarioRow,
  CancelFindCuentaConsumoRow,
  CancelFindLiquidacionNextRow,
  CancelFindLiquidacionRow,
  CancelFindPagoRow,
  CreateFindAsignacionConsumoRow,
  CreateFindCuentaConsumoRow,
  CreateFindJornadaOperativaRow,
  CreateFindLiquidacionRow,
  CreateFindPedidoRow,
  CreateFindSolicitudCancelacionRow,
  CreateInsertLiquidacionRow,
  SettlementFindDetalleLiquidacionRow,
  SettlementFindPagoRow,
} from './types/settlements.types.js';

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement)
    private readonly records: Repository<Settlement>,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
  ) {}

  private async authorize(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
  ) {
    const [user] = await this.authorizeFindUsuario(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
    if (!user || !user.activo || user.revocada_en || !user.valid)
      throw new UnauthorizedException('Sesión no válida.');
    const [permission] = await this.authorizeFindUsuarioNext(m, {
      userId: actor.userId,
    });
    if (!permission)
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción.',
      );
  }

  async settlement(
    id: string,
    clientId?: string,
    m: EntityManager = this.records.manager,
  ) {
    const [row] = await this.settlementFindPago(m, {
      id,
      clientId: clientId ?? null,
    });
    if (!row) throw new NotFoundException('Liquidación no encontrada.');
    row.items = await this.settlementFindDetalleLiquidacion(m, {
      id,
    });
    return row;
  }

  async settlements(query: SettlementListDto) {
    const { rows, total } = await this.listSettlementIds(
      this.records.manager,
      query,
    );
    return {
      items: await Promise.all(rows.map((row) => this.settlement(row.id))),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async create(
    accountId: string,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idempotency.run(
      { userId: actor.userId },
      `accounts/${accountId.toLowerCase()}/settlements`,
      key,
      {},
      201,
      'liquidacion',
      {
        authorize: (m) => this.authorize(m, actor),
        action: async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const [day] = await this.createFindJornadaOperativa(m, {
            zone,
          });
          if (!day)
            throw new ConflictException(
              'Se requiere jornada y caja actuales abiertas.',
            );
          const [account] = await this.createFindCuentaConsumo(m, {
            accountId,
          });
          if (!account) throw new NotFoundException('Cuenta no encontrada.');
          if (account.modalidad === 'delivery')
            throw new ConflictException(
              'La liquidación del domicilio se genera con su pedido.',
            );
          if (account.estado !== 'open')
            throw new ConflictException('La cuenta está cerrada.');
          const [existing] = await this.createFindLiquidacion(m, {
            accountId,
          });
          if (existing)
            throw new ConflictException(
              'La cuenta ya tiene una liquidación pendiente.',
            );
          const [cancellation] = await this.createFindSolicitudCancelacion(m, {
            accountId,
          });
          if (cancellation)
            throw new ConflictException(
              'Hay una solicitud de cancelacion pendiente.',
            );
          const [unfinished] = await this.createFindPedido(m, {
            accountId,
          });
          if (unfinished)
            throw new ConflictException(
              'Todos los pedidos deben estar entregados.',
            );
          const items: Array<{ id: string; quantity: number; price: number }> =
            await this.createFindAsignacionConsumo(m, {
              accountId,
            });
          if (!items.length)
            throw new ConflictException(
              'La cuenta no tiene consumo pendiente.',
            );
          const total = items.reduce(
            (sum, item) => sum + item.quantity * item.price,
            0,
          );
          if (!Number.isSafeInteger(total))
            throw new ConflictException('El total supera el límite permitido.');
          const [settlement] = await this.createInsertLiquidacion(m, {
            accountId,
            cash: day.cash,
            total,
            userId: actor.userId,
          });
          await forEachSequential(items, async (item) => {
            await this.createInsertDetalleLiquidacion(m, {
              id: settlement.id,
              id2: item.id,
              quantity: item.quantity,
              price: item.price,
              quantity5: item.quantity * item.price,
            });
          });
          await this.auditLog.append(
            m,
            { userId: actor.userId },
            'liquidacion',
            settlement.id,
            'settlement.created',
            { accountId, cashRegisterId: day.cash, totalCents: total },
          );
          return {
            resourceId: settlement.id,
            response: await this.settlement(settlement.id, undefined, m),
          };
        },
      },
    );
  }

  async cancel(
    id: string,
    reason: string,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idempotency.run(
      { userId: actor.userId },
      `settlements/${id.toLowerCase()}/cancel`,
      key,
      { reason },
      200,
      'liquidacion',
      {
        authorize: (m) => this.authorize(m, actor),
        action: async (m) => {
          await this.operationalContext.lockTableOperations(m);
          const [ref] = await this.cancelFindLiquidacion(m, {
            id,
          });
          if (!ref) throw new NotFoundException('Liquidación no encontrada.');
          const [account] = await this.cancelFindCuentaConsumo(m, {
            id_cuenta: ref.id_cuenta,
          });
          if (account.modalidad === 'delivery')
            throw new ConflictException(
              'Debe anularse el pedido de domicilio.',
            );
          const [row] = await this.cancelFindLiquidacionNext(m, {
            id,
          });
          if (row.estado !== 'pending')
            throw new ConflictException('La liquidación ya fue anulada.');
          const [pendingTransfer] = await this.cancelFindPago(m, {
            id,
          });
          if (pendingTransfer)
            throw new ConflictException(
              'Existe una transferencia pendiente de verificación.',
            );
          await this.cancelUpdateLiquidacion(m, {
            id,
            userId: actor.userId,
            reason,
          });
          await this.cancelUpdateDetalleLiquidacion(m, { id });
          await this.auditLog.append(
            m,
            { userId: actor.userId },
            'liquidacion',
            id,
            'settlement.cancelled',
            { reason, accountId: ref.id_cuenta },
          );
          return {
            resourceId: id,
            response: await this.settlement(id, undefined, m),
          };
        },
      },
    );
  }

  private async authorizeFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizeFindUsuarioRow[]> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
    );
    return row ? [row] : [];
  }

  private async authorizeFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string },
  ): Promise<AuthorizeFindUsuarioNextRow[]> {
    return (await this.authorization.hasPermission(
      manager,
      input.userId,
      'settlements.manage',
    ))
      ? [{ '1': '1' }]
      : [];
  }

  private settlementFindPago(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<SettlementFindPagoRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('l')
      .select([
        'l.id_liquidacion AS id',
        'l.id_cuenta AS "accountId"',
        'l.id_caja AS "cashRegisterId"',
        'l.estado AS status',
        'l.productos_ctvs::float8 AS "productsCents"',
        'l.envio_ctvs::float8 AS "shippingCents"',
        'l.total_ctvs::float8 AS "totalCents"',
        "'USD' AS currency",
        'l.creada_por AS "createdBy"',
        'l.creada_en AS "createdAt"',
        'l.anulada_por AS "cancelledBy"',
        'l.anulada_en AS "cancelledAt"',
        'l.motivo_anulacion AS "cancellationReason"',
        'l.cerrada_en AS "settledAt"',
        'l.resolucion AS resolution',
        '(SELECT id_pago FROM pago WHERE id_liquidacion=l.id_liquidacion AND estado=\'confirmed\') AS "paymentId"',
      ])
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .where(
        'l.id_liquidacion=:id AND (:clientId::uuid IS NULL OR c.id_cliente=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<SettlementFindPagoRow>();
  }

  private settlementFindDetalleLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<SettlementFindDetalleLiquidacionRow[]> {
    return manager
      .getRepository(SettlementItem)
      .createQueryBuilder('d')
      .select([
        'd.id_detalle_liquidacion AS id',
        'd.id_asignacion AS "assignmentId"',
        'dp.id_producto AS "productId"',
        'p.nombre AS "productName"',
        'd.cantidad_snapshot AS quantity',
        'd.precio_snapshot_ctvs AS "unitPriceCents"',
        'd.importe_ctvs::float8 AS "subtotalCents"',
        'd.vigente AS active',
      ])
      .innerJoin(ConsumptionAssignment, 'a', 'a.id_asignacion=d.id_asignacion')
      .innerJoin(OrderItem, 'dp', 'dp.id_detalle=a.id_detalle')
      .innerJoin(Product, 'p', 'p.id_producto=dp.id_producto')
      .where('d.id_liquidacion=:id')
      .addOrderBy('d.id_detalle_liquidacion', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<SettlementFindDetalleLiquidacionRow>();
  }

  private createFindJornadaOperativa(
    manager: EntityManager,
    input: { zone: string },
  ): Promise<CreateFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('j')
      .select(['j.id_jornada AS id', 'c.id_caja AS cash'])
      .innerJoin(CashRegister, 'c', 'c.id_jornada=j.id_jornada')
      .where(
        "j.fecha_operativa=timezone(:zone,clock_timestamp())::date AND j.estado='open' AND c.estado='open'",
      )
      .setLock('pessimistic_write', undefined, ['j', 'c'])
      .setParameters({ zone: input.zone })
      .getRawMany<CreateFindJornadaOperativaRow>();
  }

  private createFindCuentaConsumo(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindCuentaConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('cuenta_consumo')
      .select('estado, modalidad')
      .where('id_cuenta=:accountId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ accountId: input.accountId })
      .getRawMany<CreateFindCuentaConsumoRow>();
  }

  private createFindLiquidacion(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('1 AS "1"')
      .where("id_cuenta=:accountId AND estado='pending'")
      .setParameters({ accountId: input.accountId })
      .getRawMany<CreateFindLiquidacionRow>();
  }

  private createFindSolicitudCancelacion(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindSolicitudCancelacionRow[]> {
    return manager
      .getRepository(CancellationRequest)
      .createQueryBuilder('s')
      .select('1 AS "1"')
      .innerJoin(Order, 'o', 'o.id_pedido=s.id_pedido')
      .where("o.id_cuenta=:accountId AND s.estado='pending'")
      .limit(1)
      .setParameters({ accountId: input.accountId })
      .getRawMany<CreateFindSolicitudCancelacionRow>();
  }

  private createFindPedido(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('pedido')
      .select('1 AS "1"')
      .where("id_cuenta=:accountId AND estado NOT IN ('delivered','cancelled')")
      .limit(1)
      .setParameters({ accountId: input.accountId })
      .getRawMany<CreateFindPedidoRow>();
  }

  private createFindAsignacionConsumo(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<CreateFindAsignacionConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder('a')
      .select([
        'a.id_asignacion AS id',
        'a.cantidad AS quantity',
        'd.precio_unitario_ctvs AS price',
      ])
      .innerJoin(OrderItem, 'd', 'd.id_detalle=a.id_detalle')
      .where("a.id_cuenta=:accountId AND a.estado='active'")
      .addOrderBy('a.id_asignacion', 'ASC')
      .setLock('pessimistic_write', undefined, ['a'])
      .setParameters({ accountId: input.accountId })
      .getRawMany<CreateFindAsignacionConsumoRow>();
  }

  private createInsertLiquidacion(
    manager: EntityManager,
    input: { accountId: string; cash: string; total: number; userId: string },
  ): Promise<CreateInsertLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cuenta: input.accountId,
          id_caja: input.cash,
          productos_ctvs: String(input.total),
          total_ctvs: String(input.total),
          creada_por: input.userId,
        },
      ])
      .returning('id_liquidacion AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async createInsertDetalleLiquidacion(
    manager: EntityManager,
    input: {
      id: string;
      id2: string;
      quantity: number;
      price: number;
      quantity5: number;
    },
  ): Promise<void> {
    await manager
      .getRepository(SettlementItem)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_liquidacion: input.id,
          id_asignacion: input.id2,
          cantidad_snapshot: input.quantity,
          precio_snapshot_ctvs: input.price,
          importe_ctvs: String(input.quantity5),
        },
      ])
      .execute();
  }

  private cancelFindLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CancelFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('id_cuenta AS "id_cuenta"')
      .where('id_liquidacion=:id')
      .setParameters({ id: input.id })
      .getRawMany<CancelFindLiquidacionRow>();
  }

  private cancelFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<CancelFindCuentaConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('cuenta_consumo')
      .select('modalidad AS "modalidad"')
      .where('id_cuenta=:id_cuenta')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<CancelFindCuentaConsumoRow>();
  }

  private cancelFindLiquidacionNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CancelFindLiquidacionNextRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('estado AS "estado"')
      .where('id_liquidacion=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<CancelFindLiquidacionNextRow>();
  }

  private cancelFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CancelFindPagoRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('pago')
      .select('1 AS "1"')
      .where(
        "id_liquidacion=:id AND metodo='transfer' AND estado='pendingVerification'",
      )
      .setParameters({ id: input.id })
      .getRawMany<CancelFindPagoRow>();
  }

  private async cancelUpdateLiquidacion(
    manager: EntityManager,
    input: { id: string; userId: string; reason: string },
  ): Promise<void> {
    await manager
      .getRepository(Settlement)
      .createQueryBuilder()
      .update(Settlement)
      .set({
        estado: 'cancelled',
        anulada_por: input.userId,
        anulada_en: () => 'clock_timestamp()',
        motivo_anulacion: input.reason,
      })
      .where('id_liquidacion=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async cancelUpdateDetalleLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(SettlementItem)
      .createQueryBuilder()
      .update(SettlementItem)
      .set({ vigente: false })
      .where('id_liquidacion=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async listSettlementIds(
    manager: EntityManager,
    query: SettlementListDto,
  ) {
    const args = [
      query.status ?? null,
      query.accountId ?? null,
      query.cashRegisterId ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('count(*)::int AS total')
      .where(
        '(:p1::text IS NULL OR estado=:p1) AND (:p2::uuid IS NULL OR id_cuenta=:p2) AND (:p3::uuid IS NULL OR id_caja=:p3)',
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
    const rows: Array<{ id: string }> = await manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('id_liquidacion AS id')
      .where(
        '(:p1::text IS NULL OR estado=:p1) AND (:p2::uuid IS NULL OR id_cuenta=:p2) AND (:p3::uuid IS NULL OR id_caja=:p3)',
      )
      .addOrderBy('creada_en', 'DESC')
      .addOrderBy('id_liquidacion', 'DESC')
      .limit(Number(queryValues2[3]))
      .offset(Number(queryValues2[4]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { rows, total };
  }
}
