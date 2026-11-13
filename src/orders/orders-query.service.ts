import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { DeliveryDetails } from '../delivery/entities/delivery-details.entity.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../operations/entities/operations-settings.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { RestaurantTable } from '../tables/entities/restaurant-table.entity.js';
import { TableVisit } from '../visits/entities/table-visit.entity.js';
import { type AdminOrderQueryDto } from './dto/admin-order-query.dto.js';
import { type OrderQueryDto } from './dto/order-query.dto.js';
import { OrderHistory } from './entities/order-history.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrderVersion } from './entities/order-version.entity.js';
import { Order } from './entities/order.entity.js';
import {
  DetailFindDetallePedidoRow,
  DetailFindEntregaDomicilioRow,
  DetailFindHistorialPedidoRow,
  DetailFindLiquidacionRow,
  DetailFindPedidoRow,
  HistoryFindDetallePedidoRow,
  HistoryFindVersionPedidoRow,
} from './types/orders.types.js';

@Injectable()
export class OrdersQueryService {
  constructor(
    @InjectRepository(Order) private readonly records: Repository<Order>,
  ) {}

  async detail(
    id: string,
    clientId?: string,
    history = false,
    m: EntityManager = this.records.manager,
  ) {
    const [order] = await this.detailFindPedido(m, {
      id,
      clientId: clientId ?? null,
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    const [delivery] = await this.detailFindEntregaDomicilio(m, {
      id,
    });
    order.delivery = delivery ?? null;
    order.productsCents = order.totalCents;
    order.shippingCents = delivery?.shippingCents ?? 0;
    order.totalCents += order.shippingCents;
    const [bill] = await this.detailFindLiquidacion(m, {
      accountId: order.accountId,
    });
    order.settlement = bill ?? null;
    order.items = await this.detailFindDetallePedido(m, {
      versionId: order.versionId,
    });
    if (history)
      order.history = await this.detailFindHistorialPedido(m, {
        id,
      });
    return order;
  }

  async history(id: string, clientId?: string) {
    await this.detail(id, clientId);
    const versions = await this.historyFindVersionPedido(this.records.manager, {
      id,
    });
    for (const version of versions)
      version.items = await this.historyFindDetallePedido(
        this.records.manager,
        { id: version.id },
      );
    const events = await this.detailFindHistorialPedido(this.records.manager, {
      id,
    });
    return { versions, events };
  }

  async list(query: OrderQueryDto | AdminOrderQueryDto, clientId?: string) {
    const { rows, total } = await this.listOrderIds(
      this.records.manager,
      query,
      clientId,
    );
    const items = await Promise.all(
      rows.map(async (row) => {
        const detail = await this.detail(row.id, clientId);
        delete detail.delivery;
        return detail;
      }),
    );
    return { items, total, page: query.page, limit: query.limit };
  }

  private detailFindPedido(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<DetailFindPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select([
        'o.id_pedido AS id',
        'o.modalidad AS modality',
        'o.id_visita AS "visitId"',
        'o.id_jornada AS "operatingDayId"',
        'o.id_cuenta AS "accountId"',
        'o.estado AS status',
        'o.enviado_en AS "submittedAt"',
        'o.editable_hasta AS "editableUntil"',
        "COALESCE(o.estado='submitted' AND o.editable_hasta>clock_timestamp() AND c.estado='open' AND p.estado='approved' AND vm.estado='open' AND t.activa AND j.estado='open' AND j.fecha_operativa=timezone(cfg.zona_horaria,clock_timestamp())::date,false) AS \"canEdit\"",
        'v.id_version AS "versionId"',
        'v.numero AS version',
        'v.observaciones AS notes',
        'v.total_productos_ctvs::float8 AS "totalCents"',
        "'USD' AS currency",
      ])
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .leftJoin(Participant, 'p', 'p.id_participante=c.id_participante')
      .leftJoin(TableVisit, 'vm', 'vm.id_visita=o.id_visita')
      .leftJoin(RestaurantTable, 't', 't.id_mesa=vm.id_mesa')
      .innerJoin(OperatingDay, 'j', 'j.id_jornada=o.id_jornada')
      .innerJoin(OperationsSettings, 'cfg', 'cfg.id_configuracion=1')
      .innerJoin(
        OrderVersion,
        'v',
        "v.id_pedido=o.id_pedido AND v.estado='current'",
      )
      .where(
        'o.id_pedido=:id AND (:clientId::uuid IS NULL OR c.id_cliente=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<DetailFindPedidoRow>();
  }

  private detailFindEntregaDomicilio(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindEntregaDomicilioRow[]> {
    return manager
      .getRepository(DeliveryDetails)
      .createQueryBuilder('entrega_domicilio')
      .select([
        'comprobante_hasta AS "receiptSubmissionDeadline"',
        'despachado_en AS "dispatchedAt"',
        'despachado_por AS "dispatchedBy"',
        'entregado_en AS "deliveredAt"',
        'entregado_por AS "deliveredBy"',
        'id_solicitud AS "requestId"',
        'destinatario AS "recipientName"',
        'telefono AS phone',
        'direccion AS address',
        'referencias AS references',
        'latitud AS latitude',
        'longitud AS longitude',
        'version_configuracion AS "configurationVersion"',
        'tarifa_ctvs::float8 AS "shippingCents"',
      ])
      .where('id_pedido=:id')
      .setParameters({ id: input.id })
      .getRawMany<DetailFindEntregaDomicilioRow>();
  }

  private detailFindLiquidacion(
    manager: EntityManager,
    input: { accountId: string },
  ): Promise<DetailFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select(['id_liquidacion AS id', 'estado AS status'])
      .where('id_cuenta=:accountId')
      .addOrderBy('creada_en', 'DESC')
      .limit(1)
      .setParameters({ accountId: input.accountId })
      .getRawMany<DetailFindLiquidacionRow>();
  }

  private detailFindDetallePedido(
    manager: EntityManager,
    input: { versionId: string },
  ): Promise<DetailFindDetallePedidoRow[]> {
    return manager
      .getRepository(OrderItem)
      .createQueryBuilder('d')
      .select([
        'd.id_detalle AS id',
        'd.id_producto AS "productId"',
        'd.cantidad AS quantity',
        'd.precio_unitario_ctvs AS "unitPriceCents"',
        '(d.cantidad::bigint*d.precio_unitario_ctvs)::float8 AS "subtotalCents"',
        'd.controla_stock_snapshot AS "tracksInventory"',
        'd.observaciones AS notes',
      ])
      .where('d.id_version=:versionId')
      .addOrderBy('d.id_producto', 'ASC')
      .setParameters({ versionId: input.versionId })
      .getRawMany<DetailFindDetallePedidoRow>();
  }

  private detailFindHistorialPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindHistorialPedidoRow[]> {
    return manager
      .getRepository(OrderHistory)
      .createQueryBuilder('historial_pedido')
      .select([
        'actor_tipo AS "actorType"',
        'actor_usuario AS "userId"',
        'actor_sesion_cliente AS "guestSessionId"',
        'evento AS event',
        'estado_anterior AS "previousStatus"',
        'estado_nuevo AS "newStatus"',
        'motivo AS reason',
        'ocurrido_en AS "occurredAt"',
      ])
      .where('id_pedido=:id')
      .addOrderBy('ocurrido_en', 'ASC')
      .addOrderBy('id_historial', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<DetailFindHistorialPedidoRow>();
  }

  private historyFindVersionPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<HistoryFindVersionPedidoRow[]> {
    return manager
      .getRepository(OrderVersion)
      .createQueryBuilder('version_pedido')
      .select([
        'id_version AS id',
        'numero AS version',
        'estado AS status',
        'total_productos_ctvs::float8 AS "totalCents"',
        'observaciones AS notes',
        'creada_en AS "createdAt"',
      ])
      .where('id_pedido=:id')
      .addOrderBy('numero', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<HistoryFindVersionPedidoRow>();
  }

  private historyFindDetallePedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<HistoryFindDetallePedidoRow[]> {
    return manager
      .getRepository(OrderItem)
      .createQueryBuilder('detalle_pedido')
      .select([
        'id_detalle AS id',
        'id_producto AS "productId"',
        'cantidad AS quantity',
        'precio_unitario_ctvs AS "unitPriceCents"',
        'controla_stock_snapshot AS "tracksInventory"',
        'observaciones AS notes',
      ])
      .where('id_version=:id')
      .addOrderBy('id_producto', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<HistoryFindDetallePedidoRow>();
  }

  private async listOrderIds(
    manager: EntityManager,
    query: OrderQueryDto | AdminOrderQueryDto,
    clientId?: string,
  ) {
    const admin = query as AdminOrderQueryDto;
    const args = [
      clientId ?? null,
      query.visitId ?? null,
      admin.tableId ?? null,
      admin.operatingDayId ?? null,
      query.status ?? null,
      query.modality ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('count(*)::int AS total')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .leftJoin(TableVisit, 'v', 'v.id_visita=o.id_visita')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::uuid IS NULL OR o.id_visita=:p2) AND (:p3::uuid IS NULL OR v.id_mesa=:p3) AND (:p4::uuid IS NULL OR o.id_jornada=:p4) AND (:p5::text IS NULL OR o.estado=:p5) AND (:p6::text IS NULL OR o.modalidad=:p6)',
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
      .getRepository(Order)
      .createQueryBuilder('o')
      .select('o.id_pedido AS id')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .leftJoin(TableVisit, 'v', 'v.id_visita=o.id_visita')
      .where(
        '(:p1::uuid IS NULL OR c.id_cliente=:p1) AND (:p2::uuid IS NULL OR o.id_visita=:p2) AND (:p3::uuid IS NULL OR v.id_mesa=:p3) AND (:p4::uuid IS NULL OR o.id_jornada=:p4) AND (:p5::text IS NULL OR o.estado=:p5) AND (:p6::text IS NULL OR o.modalidad=:p6)',
      )
      .addOrderBy('o.enviado_en', 'DESC')
      .addOrderBy('o.id_pedido', 'DESC')
      .limit(Number(queryValues2[6]))
      .offset(Number(queryValues2[7]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { rows, total };
  }
}
