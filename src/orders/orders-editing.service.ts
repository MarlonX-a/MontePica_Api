import { forEachSequential } from '../common/async/for-each-sequential.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { ConsumptionAssignment } from '../accounts/entities/consumption-assignment.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { type ClientIdentity } from '../common/identity/client-access.guard.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { type EditOrderDto } from './dto/edit-order.dto.js';
import { OrderHistory } from './entities/order-history.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrderVersion } from './entities/order-version.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderInventoryService } from './order-inventory.service.js';
import { OrdersQueryService } from './orders-query.service.js';
import {
  EditFindDetallePedidoRow,
  EditFindLiquidacionRow,
  EditFindPedidoNextRow,
  EditFindPedidoRow,
  EditInsertVersionPedidoRow,
} from './types/orders.types.js';

@Injectable()
export class OrdersEditingService {
  constructor(
    @InjectRepository(Order) private readonly records: Repository<Order>,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly queries: OrdersQueryService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly inventoryOperations: OrderInventoryService,
  ) {}

  async edit(
    id: string,
    dto: EditOrderDto,
    client: ClientIdentity,
    key?: string,
  ) {
    const ids = dto.items.map((item) => item.productId.toLowerCase());
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('No se admiten productos repetidos.');
    const actor = client.guestSessionId
      ? { guestSessionId: client.guestSessionId }
      : { userId: client.userId };
    return this.idempotency.run(
      actor,
      `orders/${id.toLowerCase()}/edit`,
      key,
      dto,
      200,
      'pedido',
      {
        authorize: async (m) => {
          await this.participants.authenticate(m, client);
          await this.detail(id, client.clientId, false, m);
        },
        action: async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const [ref] = await this.editFindPedido(m, { id });
          if (!ref) throw new NotFoundException('Pedido no encontrado.');
          if (!ref.id_visita)
            throw new ConflictException('Los domicilios no admiten edición.');
          await this.operationalContext.lockActiveVisit(m, ref.id_visita, zone);
          const [order] = await this.editFindPedidoNext(m, {
            id,
            clientId: client.clientId,
          });
          if (
            order?.estado !== 'submitted' ||
            order.numero !== dto.expectedVersion ||
            !order.editable
          )
            throw new ConflictException(
              'El pedido no se puede editar o su versión cambió.',
            );
          const [pending] = await this.editFindLiquidacion(m, {
            id_cuenta: order.id_cuenta,
          });
          if (pending)
            throw new ConflictException(
              'La cuenta tiene una liquidación pendiente.',
            );
          const products: Array<{
            id: string;
            price: number;
            tracks: boolean;
          }> = await this.inventoryOperations.lockAvailableProducts(m, {
            productIds: ids,
          });
          if (products.length !== ids.length)
            throw new ConflictException(
              'Uno o más productos no están disponibles.',
            );
          const old: Array<{ id: string; price: number; tracks: boolean }> =
            await this.editFindDetallePedido(m, {
              id_version: order.id_version,
            });
          const reservations: Array<{
            id: string;
            inventory: string;
            quantity: number;
          }> = await this.inventoryOperations.lockVersionReservations(m, {
            versionId: order.id_version,
          });
          const stock: Array<{
            id: string;
            product: string;
            available: number;
          }> = await this.inventoryOperations.lockReplacementInventory(m, {
            operatingDayId: order.id_jornada,
            productIds: ids,
            reservedInventoryIds: reservations.map((r) => r.inventory),
          });
          let total = 0;
          for (const item of dto.items) {
            const product = products.find(
              (p) => p.id === item.productId.toLowerCase(),
            )!;
            const snapshot = old.find((p) => p.id === product.id) ?? product;
            const inventory = stock.find((s) => s.product === product.id);
            const released = reservations
              .filter((r) => r.inventory === inventory?.id)
              .reduce((a, r) => a + r.quantity, 0);
            if (
              snapshot.tracks &&
              (!inventory || inventory.available + released < item.quantity)
            )
              throw new ConflictException(
                'Inventario insuficiente o sin inicializar.',
              );
            total += snapshot.price * item.quantity;
          }
          if (!Number.isSafeInteger(total))
            throw new ConflictException('El total supera el límite permitido.');
          await forEachSequential(reservations, async (r) => {
            await this.inventoryOperations.decreaseReservedQuantity(m, {
              inventoryId: r.inventory,
              quantity: r.quantity,
            });
            await this.inventoryOperations.releaseReservation(m, {
              reservationId: r.id,
            });
          });
          await this.editUpdateAsignacionConsumo(m, {
            id_version: order.id_version,
          });
          await this.editUpdateVersionPedido(m, {
            id_version: order.id_version,
          });
          const [version] = await this.editInsertVersionPedido(m, {
            id,
            numero: order.numero + 1,
            total,
            notes: dto.notes ?? null,
          });
          await forEachSequential(dto.items, async (item) => {
            const product = products.find(
              (p) => p.id === item.productId.toLowerCase(),
            )!;
            const snapshot = old.find((p) => p.id === product.id) ?? product;
            const [detail] = await this.inventoryOperations.insertOrderItem(m, {
              versionId: version.id,
              productId: product.id,
              quantity: item.quantity,
              unitPriceCents: snapshot.price,
              tracksInventory: snapshot.tracks,
              notes: item.notes ?? null,
            });
            await this.editInsertAsignacionConsumo(m, {
              id: detail.id,
              id_cuenta: order.id_cuenta,
              quantity: item.quantity,
            });
            if (snapshot.tracks) {
              const i = stock.find((s) => s.product === product.id)!;
              await this.inventoryOperations.increaseReservedQuantity(m, {
                inventoryId: i.id,
                quantity: item.quantity,
              });
              await this.inventoryOperations.createReservation(m, {
                orderItemId: detail.id,
                inventoryId: i.id,
                quantity: item.quantity,
              });
            }
          });
          await this.editInsertHistorialPedido(m, {
            id,
            versionId: version.id,
            userId: actor.userId ?? null,
            guestSessionId: actor.guestSessionId ?? null,
            actorType: actor.guestSessionId ? 'sesion_cliente' : 'usuario',
          });
          await this.auditLog.append(m, actor, 'pedido', id, 'order.edited', {
            previousVersion: order.numero,
            version: order.numero + 1,
            totalCents: total,
          });
          return {
            resourceId: id,
            response: await this.detail(id, client.clientId, false, m),
          };
        },
      },
    );
  }

  async detail(
    id: string,
    clientId?: string,
    history = false,
    m: EntityManager = this.records.manager,
  ) {
    return this.queries.detail(id, clientId, history, m);
  }

  private editFindPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<EditFindPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('pedido')
      .select('id_visita AS "id_visita"')
      .where('id_pedido=:id')
      .setParameters({ id: input.id })
      .getRawMany<EditFindPedidoRow>();
  }

  private editFindPedidoNext(
    manager: EntityManager,
    input: { id: string; clientId: string },
  ): Promise<EditFindPedidoNextRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .select(
        'o.estado, o.id_cuenta, o.id_jornada, v.id_version, v.numero, (o.editable_hasta>clock_timestamp()) AS editable',
      )
      .innerJoin(
        OrderVersion,
        'v',
        "v.id_pedido=o.id_pedido AND v.estado='current'",
      )
      .innerJoin(ConsumptionAccount, 'c', 'c.id_cuenta=o.id_cuenta')
      .innerJoin(Participant, 'p', 'p.id_participante=c.id_participante')
      .where(
        "o.id_pedido=:id AND c.id_cliente=:clientId AND c.estado='open' AND p.estado='approved'",
      )
      .setLock('pessimistic_write', undefined, ['o', 'v', 'c', 'p'])
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<EditFindPedidoNextRow>();
  }

  private editFindLiquidacion(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<EditFindLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder('liquidacion')
      .select('1 AS "1"')
      .where("id_cuenta=:id_cuenta AND estado='pending'")
      .setParameters({ id_cuenta: input.id_cuenta })
      .getRawMany<EditFindLiquidacionRow>();
  }

  private editFindDetallePedido(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<EditFindDetallePedidoRow[]> {
    return manager
      .getRepository(OrderItem)
      .createQueryBuilder('detalle_pedido')
      .select([
        'id_producto AS id',
        'precio_unitario_ctvs AS price',
        'controla_stock_snapshot AS tracks',
      ])
      .where('id_version=:id_version')
      .setParameters({ id_version: input.id_version })
      .getRawMany<EditFindDetallePedidoRow>();
  }

  private async editUpdateAsignacionConsumo(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder()
      .update(ConsumptionAssignment)
      .set({ estado: 'superseded' })
      .where(
        "id_detalle IN (SELECT id_detalle FROM detalle_pedido WHERE id_version=:id_version) AND estado='active'",
      )
      .setParameters({ id_version: input.id_version })
      .execute();
  }

  private async editUpdateVersionPedido(
    manager: EntityManager,
    input: { id_version: string },
  ): Promise<void> {
    await manager
      .getRepository(OrderVersion)
      .createQueryBuilder()
      .update(OrderVersion)
      .set({ estado: 'superseded' })
      .where('id_version=:id_version')
      .setParameters({ id_version: input.id_version })
      .execute();
  }

  private editInsertVersionPedido(
    manager: EntityManager,
    input: { id: string; numero: number; total: number; notes: string | null },
  ): Promise<EditInsertVersionPedidoRow[]> {
    return manager
      .getRepository(OrderVersion)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.id,
          numero: input.numero,
          estado: 'current',
          total_productos_ctvs: String(input.total),
          observaciones: input.notes,
        },
      ])
      .returning('id_version AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async editInsertAsignacionConsumo(
    manager: EntityManager,
    input: { id: string; id_cuenta: string; quantity: number },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_detalle: input.id,
          id_cuenta: input.id_cuenta,
          cantidad: input.quantity,
        },
      ])
      .execute();
  }

  private async editInsertHistorialPedido(
    manager: EntityManager,
    input: {
      id: string;
      versionId: string;
      userId: string | null;
      guestSessionId: string | null;
      actorType: 'sesion_cliente' | 'usuario';
    },
  ): Promise<void> {
    await manager
      .getRepository(OrderHistory)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.id,
          id_version: input.versionId,
          actor_usuario: input.userId,
          actor_sesion_cliente: input.guestSessionId,
          actor_tipo: input.actorType,
          evento: 'order.edited',
          estado_anterior: 'submitted',
          estado_nuevo: 'submitted',
        },
      ])
      .execute();
  }
}
