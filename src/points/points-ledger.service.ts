import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { Refund } from '../refunds/entities/refund.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { PointsAccrual } from './entities/points-accrual.entity.js';
import { PointsMovement } from './entities/points-movement.entity.js';
import { PointsSettings } from './entities/points-settings.entity.js';
import { calculateEarnedPoints } from './points-arithmetic.js';
import {
  BalanceFindMovimientoPuntosRow,
  CurrentFindConfiguracionPuntosRow,
  DeliverOrderUpdateAcumulacionPuntosRow,
  RecordConfirmedPaymentFindDetalleLiquidacionRow,
  RecordConfirmedPaymentInsertAcumulacionPuntosRow,
  RefundFindAcumulacionPuntosRow,
  RequireClientFindClienteRow,
} from './types/points.types.js';

@Injectable()
export class PointsLedgerService {
  constructor(private readonly auditLog: AuditService) {}

  private async current(m: EntityManager) {
    const [r] = await this.currentFindConfiguracionPuntos(m);
    return r;
  }

  async recordConfirmedPayment(m: EntityManager, paymentId: string) {
    const [p] = await this.recordConfirmedPaymentFindDetalleLiquidacion(m, {
      paymentId,
    });
    if (p?.estado !== 'confirmed' || !p.id_cliente || !p.registered) return;
    const settings = await this.current(m);
    if (!settings.enabled) return;
    const cents = BigInt(p.products);
    const points = calculateEarnedPoints(cents, settings.pointsPerDollar);
    if (points > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ConflictException('Puntos exceden el rango permitido.');
    await this.recordConfirmedPaymentFindCliente(m, {
      id_cliente: p.id_cliente,
    });
    const state = p.modalidad === 'delivery' ? 'pending' : 'credited';
    const [a] = await this.recordConfirmedPaymentInsertAcumulacionPuntos(m, {
      paymentId,
      id_cliente: p.id_cliente,
      version: settings.version,
      productsCents: cents.toString(),
      points: points.toString(),
      state,
    });
    await this.balance(p.id_cliente, m);
    if (a)
      await this.auditLog.append(
        m,
        {},
        'acumulacion_puntos',
        a.id,
        'points.snapshot',
        { paymentId, points: Number(points), state },
      );
    if (a && state === 'credited' && points > 0n) {
      await this.recordConfirmedPaymentInsertMovimientoPuntos(m, {
        id_cliente: p.id_cliente,
        id: a.id,
        points: points.toString(),
      });
      await this.auditLog.append(
        m,
        {},
        'movimiento_puntos',
        a.id,
        'points.earned',
        { paymentId, points: Number(points) },
      );
    }
  }

  async deliverOrder(m: EntityManager, orderId: string, actor: string) {
    const rows = await this.deliverOrderUpdateAcumulacionPuntos(m, {
      orderId,
    });
    const a = rows[0];
    if (a && Number(a.puntos) > 0) {
      await this.recordConfirmedPaymentInsertMovimientoPuntos(m, {
        id_cliente: a.id_cliente,
        id: a.id_acumulacion,
        points: a.puntos,
      });
      await this.balance(a.id_cliente, m);
      await this.auditLog.append(
        m,
        { userId: actor },
        'movimiento_puntos',
        a.id_acumulacion,
        'points.earned',
        { paymentId: a.id_pago, points: Number(a.puntos) },
      );
    }
  }

  async refund(m: EntityManager, refundId: string, actor: string) {
    const [a] = await this.refundFindAcumulacionPuntos(m, {
      refundId,
    });
    if (!a || Number(a.puntos) === 0) return;
    await this.recordConfirmedPaymentFindCliente(m, {
      id_cliente: a.id_cliente,
    });
    await this.refundInsertMovimientoPuntos(m, {
      id_cliente: a.id_cliente,
      id_acumulacion: a.id_acumulacion,
      refundId,
      puntos: a.puntos,
    });
    await this.auditLog.append(
      m,
      { userId: actor },
      'movimiento_puntos',
      refundId,
      'points.refund_adjusted',
      { points: Number(a.puntos) },
    );
    await this.balance(a.id_cliente, m);
  }

  private async balance(clientId: string, m: EntityManager) {
    await this.requireClient(clientId, m);
    const [r] = await this.balanceFindMovimientoPuntos(m, {
      clientId,
    });
    if (
      ![r.balance, r.pending, r.reserved].every((v) =>
        Number.isSafeInteger(Number(v)),
      )
    )
      throw new ConflictException('Saldo fuera del rango seguro.');
    const balance = Number(r.balance),
      reservedPoints = Number(r.reserved);
    const available = BigInt(r.balance) - BigInt(r.reserved);
    return {
      balance,
      pendingPoints: Number(r.pending),
      reservedPoints,
      availablePoints: Number(available > 0n ? available : 0n),
    };
  }

  private async requireClient(id: string, m: EntityManager) {
    const [c] = await this.requireClientFindCliente(m, { id });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
  }

  private currentFindConfiguracionPuntos(
    manager: EntityManager,
  ): Promise<CurrentFindConfiguracionPuntosRow[]> {
    return manager
      .getRepository(PointsSettings)
      .createQueryBuilder('configuracion_puntos')
      .select(
        'version, habilitado AS enabled, tasa_por_dolar AS "pointsPerDollar", configurada_por AS "configuredBy", creada_en AS "createdAt"',
      )
      .addOrderBy('version', 'DESC')
      .limit(1)
      .getRawMany<CurrentFindConfiguracionPuntosRow>();
  }

  private recordConfirmedPaymentFindDetalleLiquidacion(
    manager: EntityManager,
    input: { paymentId: string },
  ): Promise<RecordConfirmedPaymentFindDetalleLiquidacionRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select(
        'p.id_pago, p.estado, l.id_cuenta, (SELECT COALESCE(sum(dl.importe_ctvs),0)::text FROM detalle_liquidacion dl WHERE dl.id_liquidacion=l.id_liquidacion) products, c.id_cliente, c.modalidad, (cl.id_usuario IS NOT NULL) registered',
      )
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=p.id_liquidacion')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=l.id_cuenta')
      .leftJoin(Client, 'cl', 'cl.id_cliente=c.id_cliente')
      .where('p.id_pago=:paymentId')
      .setLock('pessimistic_write', undefined, ['p', 'c'])
      .setParameters({ paymentId: input.paymentId })
      .getRawMany<RecordConfirmedPaymentFindDetalleLiquidacionRow>();
  }

  private async recordConfirmedPaymentFindCliente(
    manager: EntityManager,
    input: { id_cliente: string },
  ): Promise<void> {
    await manager
      .getRepository(Client)
      .createQueryBuilder('cliente')
      .select('1 AS "1"')
      .where('id_cliente=:id_cliente')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_cliente: input.id_cliente })
      .getRawMany();
  }

  private recordConfirmedPaymentInsertAcumulacionPuntos(
    manager: EntityManager,
    input: {
      paymentId: string;
      id_cliente: string;
      version: number;
      productsCents: string;
      points: string;
      state: 'pending' | 'credited';
    },
  ): Promise<RecordConfirmedPaymentInsertAcumulacionPuntosRow[]> {
    return manager
      .getRepository(PointsAccrual)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pago: input.paymentId,
          id_cliente: input.id_cliente,
          id_configuracion: () =>
            '(SELECT id_configuracion FROM configuracion_puntos WHERE version=:version)',
          productos_ctvs: String(input.productsCents),
          puntos: String(input.points),
          estado: input.state,
          acreditada_en: () =>
            "CASE WHEN :state::varchar='credited' THEN clock_timestamp() END",
        },
      ])
      .onConflict('(id_pago) DO NOTHING')
      .returning('id_acumulacion id')
      .setParameters({ version: input.version, state: input.state })
      .execute()
      .then((result) => result.raw);
  }

  private async recordConfirmedPaymentInsertMovimientoPuntos(
    manager: EntityManager,
    input: { id_cliente: string; id: string; points: string },
  ): Promise<void> {
    await manager
      .getRepository(PointsMovement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.id_cliente,
          id_acumulacion: input.id,
          tipo: 'earn',
          puntos: String(input.points),
        },
      ])
      .execute();
  }

  private async deliverOrderUpdateAcumulacionPuntos(
    manager: EntityManager,
    input: { orderId: string },
  ): Promise<DeliverOrderUpdateAcumulacionPuntosRow[]> {
    const result = await manager
      .getRepository(PointsAccrual)
      .createQueryBuilder()
      .update()
      .set({ estado: 'credited', acreditada_en: () => 'clock_timestamp()' })
      .where(
        "estado='pending' AND id_pago IN (SELECT p.id_pago FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN pedido o ON o.id_cuenta=l.id_cuenta WHERE o.id_pedido=:order)",
        { order: input.orderId },
      )
      .returning('id_acumulacion,id_cliente,puntos,id_pago')
      .execute();
    return result.raw as DeliverOrderUpdateAcumulacionPuntosRow[];
  }

  private refundFindAcumulacionPuntos(
    manager: EntityManager,
    input: { refundId: string },
  ): Promise<RefundFindAcumulacionPuntosRow[]> {
    return manager
      .getRepository(PointsAccrual)
      .createQueryBuilder('ap')
      .select('ap.id_acumulacion, ap.id_cliente, ap.puntos')
      .innerJoin(Refund, 'd', 'd.id_pago=ap.id_pago')
      .where("d.id_devolucion=:refundId AND ap.estado='credited'")
      .setLock('pessimistic_write', undefined, ['ap'])
      .setParameters({ refundId: input.refundId })
      .getRawMany<RefundFindAcumulacionPuntosRow>();
  }

  private async refundInsertMovimientoPuntos(
    manager: EntityManager,
    input: {
      id_cliente: string;
      id_acumulacion: string;
      refundId: string;
      puntos: string;
    },
  ): Promise<void> {
    await manager
      .getRepository(PointsMovement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.id_cliente,
          id_acumulacion: input.id_acumulacion,
          id_devolucion: input.refundId,
          tipo: 'refundAdjustment',
          puntos: () => '-:puntos::bigint',
        },
      ])
      .setParameters({ puntos: input.puntos })
      .execute();
  }

  private balanceFindMovimientoPuntos(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<BalanceFindMovimientoPuntosRow[]> {
    return manager
      .createQueryBuilder()
      .select(
        "COALESCE((SELECT sum(puntos) FROM movimiento_puntos WHERE id_cliente=:clientId),0)::text balance, COALESCE((SELECT sum(puntos) FROM acumulacion_puntos WHERE id_cliente=:clientId AND estado='pending'),0)::text pending, COALESCE((SELECT sum(puntos) FROM reserva_puntos_canje WHERE id_cliente=:clientId AND estado='active'),0)::text reserved",
      )
      .from('(SELECT 1)', '_singleton')
      .setParameters({ clientId: input.clientId })
      .getRawMany<BalanceFindMovimientoPuntosRow>();
  }

  private requireClientFindCliente(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RequireClientFindClienteRow[]> {
    return manager
      .getRepository(Client)
      .createQueryBuilder('cliente')
      .select('1 AS "1"')
      .where('id_cliente=:id')
      .setParameters({ id: input.id })
      .getRawMany<RequireClientFindClienteRow>();
  }
}
