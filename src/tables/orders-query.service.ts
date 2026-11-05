import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AdminOrderQueryDto, OrderQueryDto } from './orders.dto.js';
import { OrdersRepository } from './repositories/orders.repository.js';
@Injectable()
export class OrdersQueryService {
  constructor(
    private readonly db: DataSource,
    private readonly persistence: OrdersRepository = new OrdersRepository(),
  ) {}
  async detail(
    id: string,
    clientId?: string,
    history = false,
    m: EntityManager = this.db.manager,
  ) {
    const [order] = await this.persistence.detailFindPedido(m, {
      id: id,
      clientId: clientId ?? null,
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    const [delivery] = await this.persistence.detailFindEntregaDomicilio(m, {
      id: id,
    });
    order.delivery = delivery ?? null;
    order.productsCents = order.totalCents;
    order.shippingCents = delivery?.shippingCents ?? 0;
    order.totalCents += order.shippingCents;
    const [bill] = await this.persistence.detailFindLiquidacion(m, {
      accountId: order.accountId,
    });
    order.settlement = bill ?? null;
    order.items = await this.persistence.detailFindDetallePedido(m, {
      versionId: order.versionId,
    });
    if (history)
      order.history = await this.persistence.detailFindHistorialPedido(m, {
        id: id,
      });
    return order;
  }
  async history(id: string, clientId?: string) {
    await this.detail(id, clientId);
    const versions = await this.persistence.historyFindVersionPedido(
      this.db.manager,
      { id: id },
    );
    for (const version of versions)
      version.items = await this.persistence.historyFindDetallePedido(
        this.db.manager,
        { id: version.id },
      );
    const events = await this.persistence.detailFindHistorialPedido(
      this.db.manager,
      { id: id },
    );
    return { versions, events };
  }
  async list(query: OrderQueryDto | AdminOrderQueryDto, clientId?: string) {
    const { rows, total } = await this.persistence.listOrderIds(
      this.db.manager,
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
}
