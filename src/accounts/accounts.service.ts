import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Product } from '../catalog/entities/product.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { OrderVersion } from '../orders/entities/order-version.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { Refund } from '../refunds/entities/refund.entity.js';
import { SettlementItem } from '../settlements/entities/settlement-item.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import {
  AccountFindAsignacionConsumoRow,
  AccountFindCuentaConsumoRow,
  AccountFindDetalleLiquidacionRow,
  AccountFindDevolucionRow,
  AccountFindLiquidacionNextRow,
  AccountFindLiquidacionRow,
} from '../settlements/types/settlements.types.js';
import { type AccountListDto } from './dto/account-list.dto.js';
import { type AdminAccountListDto } from './dto/admin-account-list.dto.js';
import { ConsumptionAccount } from './entities/consumption-account.entity.js';
import { ConsumptionAssignment } from './entities/consumption-assignment.entity.js';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(ConsumptionAccount)
    private readonly records: Repository<ConsumptionAccount>,
  ) {}

  async account(
    id: string,
    clientId?: string,
    m: EntityManager = this.records.manager,
  ) {
    const [account] = await this.accountFindCuentaConsumo(m, {
      id,
      clientId: clientId ?? null,
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    account.items = await this.accountFindAsignacionConsumo(m, {
      id,
    });
    account.totalCents = account.items.reduce(
      (sum: number, item: { subtotalCents: number }) =>
        sum + item.subtotalCents,
      0,
    );
    account.currency = 'USD';
    const [totals] = await this.accountFindDetalleLiquidacion(m, {
      id,
    });
    account.productsCents = account.totalCents;
    const [shipping] = await this.accountFindLiquidacion(m, {
      id,
    });
    account.shippingCents = shipping.fee;
    account.totalCents += shipping.fee;
    totals.paid += shipping.paid;
    totals.resolved += shipping.paid;
    account.paidCents = totals.paid;
    account.pendingCents = Math.max(0, account.totalCents - totals.resolved);
    const [refund] = await this.accountFindDevolucion(m, {
      id,
    });
    account.refundPendingCents = refund.pending;
    account.refundedCents = refund.completed;
    const [pending] = await this.accountFindLiquidacionNext(m, {
      id,
    });
    account.pendingSettlement = pending ?? null;
    return account;
  }

  async accounts(query: AccountListDto, clientId?: string) {
    const { rows, total } = await this.listAccountIds(
      this.records.manager,
      query,
      clientId,
    );
    return {
      items: await Promise.all(
        rows.map((row) => this.account(row.id, clientId)),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private accountFindCuentaConsumo(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<AccountFindCuentaConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('c')
      .select([
        'c.id_cuenta AS id',
        'c.modalidad AS modality',
        'c.id_cliente AS "clientId"',
        'c.id_participante AS "participantId"',
        'c.id_jornada AS "operatingDayId"',
        'p.id_visita AS "visitId"',
        'c.estado AS status',
        'c.creada_en AS "createdAt"',
        'c.cerrada_en AS "closedAt"',
      ])
      .leftJoin(Participant, 'p', 'p.id_participante=c.id_participante')
      .where(
        'c.id_cuenta=:id AND (:clientId::uuid IS NULL OR c.id_cliente=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<AccountFindCuentaConsumoRow>();
  }

  private accountFindAsignacionConsumo(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindAsignacionConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder('a')
      .select([
        'a.id_asignacion AS id',
        'o.id_pedido AS "orderId"',
        'o.estado AS "orderStatus"',
        'd.id_producto AS "productId"',
        'p.nombre AS "productName"',
        'a.cantidad AS quantity',
        'd.precio_unitario_ctvs AS "unitPriceCents"',
        '(a.cantidad::bigint*d.precio_unitario_ctvs)::float8 AS "subtotalCents"',
      ])
      .innerJoin(OrderItem, 'd', 'd.id_detalle=a.id_detalle')
      .innerJoin(Product, 'p', 'p.id_producto=d.id_producto')
      .innerJoin(OrderVersion, 'v', 'v.id_version=d.id_version')
      .innerJoin(Order, 'o', 'o.id_pedido=v.id_pedido')
      .where("a.id_cuenta=:id AND a.estado='active'")
      .addOrderBy('o.enviado_en', 'ASC')
      .addOrderBy('o.id_pedido', 'ASC')
      .addOrderBy('d.id_producto', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<AccountFindAsignacionConsumoRow>();
  }

  private accountFindDetalleLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindDetalleLiquidacionRow[]> {
    return manager
      .getRepository(SettlementItem)
      .createQueryBuilder('d')
      .select([
        "COALESCE(sum(CASE WHEN l.resolucion IN ('cash','transfer') THEN d.importe_ctvs ELSE 0 END),0)::float8 AS paid",
        'COALESCE(sum(d.importe_ctvs),0)::float8 AS resolved',
      ])
      .innerJoin(Settlement, 'l', 'l.id_liquidacion=d.id_liquidacion')
      .where("l.id_cuenta=:id AND l.estado='settled' AND d.vigente")
      .setParameters({ id: input.id })
      .getRawMany<AccountFindDetalleLiquidacionRow>();
  }

  private accountFindLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select([
        'COALESCE(sum(envio_ctvs),0)::float8 AS fee',
        "COALESCE(sum(CASE WHEN estado='settled' THEN envio_ctvs ELSE 0 END),0)::float8 AS paid",
      ])
      .where("id_cuenta=:id AND estado<>'cancelled'")
      .setParameters({ id: input.id })
      .getRawMany<AccountFindLiquidacionRow>();
  }

  private accountFindDevolucion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindDevolucionRow[]> {
    return manager
      .getRepository(Refund)
      .createQueryBuilder('d')
      .select([
        "COALESCE(sum(d.importe_ctvs) FILTER (WHERE d.estado='pending'),0)::float8 AS pending",
        "COALESCE(sum(d.importe_ctvs) FILTER (WHERE d.estado='completed'),0)::float8 AS completed",
      ])
      .innerJoin(Order, 'o', 'o.id_pedido=d.id_pedido')
      .where('o.id_cuenta=:id')
      .setParameters({ id: input.id })
      .getRawMany<AccountFindDevolucionRow>();
  }

  private accountFindLiquidacionNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<AccountFindLiquidacionNextRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select([
        'id_liquidacion AS id',
        'estado AS status',
        'total_ctvs::float8 AS "totalCents"',
      ])
      .where("id_cuenta=:id AND estado='pending'")
      .setParameters({ id: input.id })
      .getRawMany<AccountFindLiquidacionNextRow>();
  }

  private async listAccountIds(
    manager: EntityManager,
    query: AccountListDto,
    clientId?: string,
  ) {
    const admin = query as AdminAccountListDto;
    const args = [
      clientId ?? null,
      query.status ?? null,
      admin.operatingDayId ?? null,
      admin.visitId ?? null,
      query.modality ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('c')
      .select('count(*)::int AS total')
      .leftJoin(Participant, 'p', 'p.id_participante=c.id_participante')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::text IS NULL OR c.estado=:p2) AND (:p3::uuid IS NULL OR c.id_jornada=:p3) AND (:p4::uuid IS NULL OR p.id_visita=:p4) AND (:p5::text IS NULL OR c.modalidad=:p5)',
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
      .getRepository(ConsumptionAccount)
      .createQueryBuilder('c')
      .select('c.id_cuenta AS id')
      .leftJoin(Participant, 'p', 'p.id_participante=c.id_participante')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::text IS NULL OR c.estado=:p2) AND (:p3::uuid IS NULL OR c.id_jornada=:p3) AND (:p4::uuid IS NULL OR p.id_visita=:p4) AND (:p5::text IS NULL OR c.modalidad=:p5)',
      )
      .addOrderBy('c.creada_en', 'DESC')
      .addOrderBy('c.id_cuenta', 'DESC')
      .limit(Number(queryValues2[5]))
      .offset(Number(queryValues2[6]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { rows, total };
  }
}
