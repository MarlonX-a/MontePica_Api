import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { PointsService } from '../points/points.service.js';
import { RewardsService } from '../rewards/rewards.service.js';
import type { ClientIdentity } from './client-access.guard.js';
import { OrdersQueryService } from './orders-query.service.js';
import type {
  AdminOrderQueryDto,
  CancelOrderDto,
  CreateOrderDto,
  EditOrderDto,
  OrderQueryDto,
  OrderTransitionDto,
} from './orders.dto.js';
import { ParticipantsService } from './participants.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { OrdersRepository } from './repositories/orders.repository.js';
import { auditTableOperation } from './table-audit.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DataSource,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly config: ConfigService,
    private readonly points: PointsService,
    private readonly rewards: RewardsService,
    private readonly queries: OrdersQueryService = new OrdersQueryService(db),
    private readonly persistence: OrdersRepository = new OrdersRepository(),
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
      async (m) => {
        await this.participants.authenticate(m, client);
        await this.detail(id, client.clientId, false, m);
      },
      async (m) => {
        const zone = await lockTableOperations(m);
        const [ref] = await this.persistence.editFindPedido(m, { id: id });
        if (!ref) throw new NotFoundException('Pedido no encontrado.');
        if (!ref.id_visita)
          throw new ConflictException('Los domicilios no admiten edición.');
        await lockActiveVisit(m, ref.id_visita, zone);
        const [order] = await this.persistence.editFindPedidoNext(m, {
          id: id,
          clientId: client.clientId,
        });
        if (
          !order ||
          order.estado !== 'submitted' ||
          order.numero !== dto.expectedVersion ||
          !order.editable
        )
          throw new ConflictException(
            'El pedido no se puede editar o su versión cambió.',
          );
        const [pending] = await this.persistence.editFindLiquidacion(m, {
          id_cuenta: order.id_cuenta,
        });
        if (pending)
          throw new ConflictException(
            'La cuenta tiene una liquidación pendiente.',
          );
        const products: Array<{ id: string; price: number; tracks: boolean }> =
          await this.persistence.editFindProducto(m, { ids: ids });
        if (products.length !== ids.length)
          throw new ConflictException(
            'Uno o más productos no están disponibles.',
          );
        const old: Array<{ id: string; price: number; tracks: boolean }> =
          await this.persistence.editFindDetallePedido(m, {
            id_version: order.id_version,
          });
        const reservations: Array<{
          id: string;
          inventory: string;
          quantity: number;
        }> = await this.persistence.editFindReservaInventario(m, {
          id_version: order.id_version,
        });
        const stock: Array<{ id: string; product: string; available: number }> =
          await this.persistence.editFindInventarioDiario(m, {
            id_jornada: order.id_jornada,
            ids: ids,
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
        for (const r of reservations) {
          await this.persistence.editUpdateInventarioDiario(m, {
            inventory: r.inventory,
            quantity: r.quantity,
          });
          await this.persistence.editUpdateReservaInventario(m, { id: r.id });
        }
        await this.persistence.editUpdateAsignacionConsumo(m, {
          id_version: order.id_version,
        });
        await this.persistence.editUpdateVersionPedido(m, {
          id_version: order.id_version,
        });
        const [version] = await this.persistence.editInsertVersionPedido(m, {
          id: id,
          numero: order.numero + 1,
          total: total,
          notes: dto.notes ?? null,
        });
        for (const item of dto.items) {
          const product = products.find(
            (p) => p.id === item.productId.toLowerCase(),
          )!;
          const snapshot = old.find((p) => p.id === product.id) ?? product;
          const [detail] = await this.persistence.editInsertDetallePedido(m, {
            id: version.id,
            id2: product.id,
            quantity: item.quantity,
            price: snapshot.price,
            tracks: snapshot.tracks,
            notes: item.notes ?? null,
          });
          await this.persistence.editInsertAsignacionConsumo(m, {
            id: detail.id,
            id_cuenta: order.id_cuenta,
            quantity: item.quantity,
          });
          if (snapshot.tracks) {
            const i = stock.find((s) => s.product === product.id)!;
            await this.persistence.editUpdateInventarioDiarioNext(m, {
              id: i.id,
              quantity: item.quantity,
            });
            await this.persistence.editInsertReservaInventario(m, {
              id: detail.id,
              id2: i.id,
              quantity: item.quantity,
            });
          }
        }
        await this.persistence.editInsertHistorialPedido(m, {
          id: id,
          versionId: version.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
          actorType: actor.guestSessionId ? 'sesion_cliente' : 'usuario',
        });
        await auditTableOperation(m, actor, 'pedido', id, 'order.edited', {
          previousVersion: order.numero,
          version: order.numero + 1,
          totalCents: total,
        });
        return {
          resourceId: id,
          response: await this.detail(id, client.clientId, false, m),
        };
      },
    );
  }

  async transition(
    id: string,
    action: 'cancel' | 'start-preparation' | 'ready' | 'dispatch' | 'deliver',
    dto: OrderTransitionDto | CancelOrderDto,
    actor: { userId?: string; guestSessionId?: string; sessionId?: string },
    client?: ClientIdentity,
    key?: string,
  ) {
    return this.idempotency.run(
      actor,
      `orders/${id.toLowerCase()}/${action}`,
      key,
      dto,
      200,
      'pedido',
      async (m) => {
        if (client) {
          await this.participants.authenticate(m, client);
          await this.detail(id, client.clientId, false, m);
        } else {
          const [valid] = await this.persistence.transitionFindUsuario(m, {
            userId: actor.userId,
            sessionId: actor.sessionId,
          });
          if (!valid) throw new UnauthorizedException('Sesion no valida.');
          const [allowed] = await this.persistence.transitionFindUsuarioNext(
            m,
            { userId: actor.userId },
          );
          if (!allowed)
            throw new ForbiddenException('Falta permiso orders.manage.');
        }
      },
      async (m) => {
        const zone = await lockTableOperations(m);
        const [ref] = await this.persistence.editFindPedido(m, { id: id });
        if (!ref) throw new NotFoundException('Pedido no encontrado.');
        if (action === 'start-preparation' && ref.id_visita)
          await lockActiveVisit(m, ref.id_visita, zone);
        const [order] = await this.persistence.transitionFindPedidoNext(m, {
          id: id,
        });
        if (order.modalidad === 'delivery') {
          if (client)
            throw new ConflictException(
              'Operación no habilitada para domicilios.',
            );
          const [account] = await this.persistence.transitionFindCuentaConsumo(
            m,
            { id_cuenta: order.id_cuenta },
          );
          if (account.estado !== 'open')
            throw new ConflictException('La cuenta debe estar abierta.');
          if (action === 'start-preparation' || action === 'dispatch') {
            const [day] = await this.persistence.transitionFindJornadaOperativa(
              m,
              { id_jornada: order.id_jornada, zone: zone },
            );
            const [paid] = await this.persistence.transitionFindLiquidacion(m, {
              id_cuenta: order.id_cuenta,
            });
            if ((action === 'start-preparation' && !day) || !paid)
              throw new ConflictException(
                'Se requiere jornada actual abierta y transferencia confirmada.',
              );
          }
          if (action === 'cancel') {
            const [payment] = await this.persistence.transitionFindPago(m, {
              id_cuenta: order.id_cuenta,
            });
            if (payment)
              throw new ConflictException(
                'Existe un pago confirmado o pendiente.',
              );
            await this.persistence.transitionUpdateLiquidacion(m, {
              id_cuenta: order.id_cuenta,
              userId: actor.userId,
              reason: 'reason' in dto ? dto.reason : null,
            });
            await this.persistence.transitionUpdateDetalleLiquidacion(m, {
              id_cuenta: order.id_cuenta,
            });
            await this.persistence.transitionUpdateCuentaConsumo(m, {
              id_cuenta: order.id_cuenta,
            });
          }
        }
        const [pendingCancellation] =
          await this.persistence.transitionFindSolicitudCancelacion(m, {
            id: id,
          });
        if (pendingCancellation && action !== 'cancel')
          throw new ConflictException(
            'El pedido tiene una solicitud de cancelacion pendiente.',
          );
        if (action === 'dispatch' && order.modalidad !== 'delivery')
          throw new ConflictException('Solo domicilios admiten despacho.');
        const expected: Record<string, string> = {
          cancel: 'submitted',
          'start-preparation': 'submitted',
          ready: 'preparing',
          dispatch: 'ready',
          deliver: order.modalidad === 'delivery' ? 'dispatched' : 'ready',
        };
        if (
          order.numero !== dto.expectedVersion ||
          order.estado !== expected[action]
        )
          throw new ConflictException(
            'Estado o versión del pedido no válidos.',
          );
        const target: Record<string, string> = {
          cancel: 'cancelled',
          'start-preparation': 'preparing',
          ready: 'ready',
          dispatch: 'dispatched',
          deliver: 'delivered',
        };
        if (action === 'cancel' || action === 'start-preparation') {
          const reservations: Array<{
            id: string;
            inventory: string;
            quantity: number;
            physical: number;
          }> = await this.persistence.transitionFindReservaInventario(m, {
            id_version: order.id_version,
          });
          for (const reservation of reservations) {
            if (action === 'cancel')
              await this.persistence.editUpdateInventarioDiario(m, {
                inventory: reservation.inventory,
                quantity: reservation.quantity,
              });
            else {
              await this.persistence.transitionUpdateInventarioDiarioNext(m, {
                inventory: reservation.inventory,
                quantity: reservation.quantity,
              });
              await this.persistence.transitionInsertMovimientoInventario(m, {
                inventory: reservation.inventory,
                id: reservation.id,
                userId: actor.userId,
                physicalDelta: -reservation.quantity,
                physical: reservation.physical,
                resultingQuantity: reservation.physical - reservation.quantity,
              });
            }
            await this.persistence.transitionUpdateReservaInventario(m, {
              id: reservation.id,
              status: action === 'cancel' ? 'released' : 'consumed',
            });
          }
          if (action === 'cancel')
            await this.persistence.editUpdateAsignacionConsumo(m, {
              id_version: order.id_version,
            });
        }
        await this.persistence.transitionUpdatePedido(m, {
          id: id,
          status: target[action],
        });
        if (action === 'cancel' && order.origen === 'reward')
          await this.rewards.refundForOrder(m, id, actor);
        if (
          order.modalidad === 'delivery' &&
          (action === 'dispatch' || action === 'deliver')
        ) {
          await this.persistence.transitionUpdateEntregaDomicilio(
            m,
            [id, actor.userId],
            action,
          );
          if (action === 'deliver')
            await this.persistence.transitionUpdateCuentaConsumo(m, {
              id_cuenta: order.id_cuenta,
            });
          if (action === 'deliver')
            await this.points.deliverOrder(m, id, actor.userId ?? '');
        }
        const reason = 'reason' in dto ? dto.reason : null;
        await this.persistence.transitionInsertHistorialPedido(m, {
          id: id,
          id_version: order.id_version,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
          actorType: actor.guestSessionId ? 'sesion_cliente' : 'usuario',
          event: `order.${action}`,
          estado: order.estado,
          nextStatus: target[action],
          reason: reason,
        });
        await auditTableOperation(m, actor, 'pedido', id, `order.${action}`, {
          before: order.estado,
          after: target[action],
          reason,
        });
        return {
          resourceId: id,
          response: await this.detail(id, client?.clientId, false, m),
        };
      },
    );
  }

  async create(
    visitId: string,
    dto: CreateOrderDto,
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
      `visits/${visitId.toLowerCase()}/orders`,
      key,
      dto,
      201,
      'pedido',
      async (m) => {
        await this.participants.authenticate(m, client);
        const [own] = await this.persistence.createFindParticipante(m, {
          visitId: visitId,
          clientId: client.clientId,
        });
        if (!own) throw new NotFoundException('Participación no encontrada.');
      },
      async (m) => {
        const zone = await lockTableOperations(m);
        await lockActiveVisit(m, visitId, zone);
        const [account] = await this.persistence.createFindParticipanteNext(m, {
          visitId: visitId,
          clientId: client.clientId,
        });
        if (!account)
          throw new ConflictException(
            'Se requiere una participación aprobada y cuenta abierta.',
          );
        const [cash] = await this.persistence.createFindCaja(m, {
          day: account.day,
        });
        if (cash?.estado === 'closed')
          throw new ConflictException('La caja de la jornada ya fue cerrada.');
        const [pending] = await this.persistence.editFindLiquidacion(m, {
          id_cuenta: account.id,
        });
        if (pending)
          throw new ConflictException(
            'La cuenta tiene una liquidación pendiente.',
          );
        const products: Array<{ id: string; price: number; tracks: boolean }> =
          await this.persistence.editFindProducto(m, { ids: ids });
        if (products.length !== ids.length)
          throw new ConflictException(
            'Uno o más productos no están disponibles.',
          );
        const inventory: Array<{
          id: string;
          product: string;
          available: number;
        }> = await this.persistence.createFindInventarioDiario(m, {
          day: account.day,
          ids: ids,
        });
        let total = 0;
        for (const item of dto.items) {
          const product = products.find(
            (p) => p.id === item.productId.toLowerCase(),
          )!;
          const stock = inventory.find((i) => i.product === product.id);
          if (product.tracks && (!stock || stock.available < item.quantity))
            throw new ConflictException(
              'Inventario insuficiente o sin inicializar.',
            );
          total += product.price * item.quantity;
        }
        if (!Number.isSafeInteger(total))
          throw new ConflictException('El total supera el límite permitido.');
        const [order] = await this.persistence.createInsertPedido(m, {
          day: account.day,
          visitId: visitId,
          id: account.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
        });
        const [version] = await this.persistence.createInsertVersionPedido(m, {
          id: order.id,
          total: total,
          notes: dto.notes ?? null,
        });
        for (const item of dto.items) {
          const product = products.find(
            (p) => p.id === item.productId.toLowerCase(),
          )!;
          const [detail] = await this.persistence.editInsertDetallePedido(m, {
            id: version.id,
            id2: product.id,
            quantity: item.quantity,
            price: product.price,
            tracks: product.tracks,
            notes: item.notes ?? null,
          });
          await this.persistence.createInsertAsignacionConsumo(m, {
            id: detail.id,
            id2: account.id,
            quantity: item.quantity,
          });
          if (product.tracks) {
            const stock = inventory.find((i) => i.product === product.id)!;
            await this.persistence.editUpdateInventarioDiarioNext(m, {
              id: stock.id,
              quantity: item.quantity,
            });
            await this.persistence.editInsertReservaInventario(m, {
              id: detail.id,
              id2: stock.id,
              quantity: item.quantity,
            });
          }
        }
        await this.persistence.createInsertHistorialPedido(m, {
          id: order.id,
          versionId: version.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
          actorType: actor.guestSessionId ? 'sesion_cliente' : 'usuario',
        });
        await auditTableOperation(
          m,
          actor,
          'pedido',
          order.id,
          'order.submitted',
          { visitId, accountId: account.id, totalCents: total },
        );
        return {
          resourceId: order.id,
          response: await this.detail(order.id, client.clientId, false, m),
        };
      },
    );
  }

  async createDelivery(
    requestId: string,
    dto: CreateOrderDto,
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
      `delivery-requests/${requestId.toLowerCase()}/orders`,
      key,
      dto,
      201,
      'pedido',
      async (m) => {
        await this.participants.authenticate(m, client);
        const [own] =
          await this.persistence.createDeliveryFindSolicitudDomicilio(m, {
            requestId: requestId,
            clientId: client.clientId,
          });
        if (!own) throw new NotFoundException('Solicitud no encontrada.');
      },
      async (m) => {
        if (!this.config.get<boolean>('TRANSFER_PAYMENTS_ENABLED', false))
          throw new ServiceUnavailableException(
            'Las transferencias están deshabilitadas.',
          );
        const zone = await lockTableOperations(m);
        const [day] = await this.persistence.createDeliveryFindJornadaOperativa(
          m,
          { zone: zone },
        );
        if (!day)
          throw new ConflictException(
            'Se requiere jornada y caja actuales abiertas.',
          );
        const [request] =
          await this.persistence.createDeliveryFindSolicitudDomicilioNext(m, {
            requestId: requestId,
          });
        const [settings] =
          await this.persistence.createDeliveryFindConfigDomicilio(m);
        const [used] =
          await this.persistence.createDeliveryFindEntregaDomicilio(m, {
            requestId: requestId,
          });
        if (
          used ||
          request.estado !== 'approved' ||
          request.id_jornada !== day.id ||
          !settings.habilitado ||
          settings.version !== request.version
        )
          throw new ConflictException(
            'La solicitud no está disponible para un pedido.',
          );
        const [account] =
          await this.persistence.createDeliveryInsertCuentaConsumo(m, {
            clientId: client.clientId,
            id: day.id,
          });
        const products: Array<{ id: string; price: number; tracks: boolean }> =
          await this.persistence.editFindProducto(m, { ids: ids });
        if (products.length !== ids.length)
          throw new ConflictException(
            'Uno o más productos no están disponibles.',
          );
        const inventory: Array<{
          id: string;
          product: string;
          available: number;
        }> = await this.persistence.createFindInventarioDiario(m, {
          day: account.day,
          ids: ids,
        });
        let total = 0;
        for (const item of dto.items) {
          const product = products.find(
            (p) => p.id === item.productId.toLowerCase(),
          )!;
          const stock = inventory.find((i) => i.product === product.id);
          if (product.tracks && (!stock || stock.available < item.quantity))
            throw new ConflictException(
              'Inventario insuficiente o sin inicializar.',
            );
          total += product.price * item.quantity;
        }
        if (!Number.isSafeInteger(total))
          throw new ConflictException('El total supera el límite permitido.');
        const shipping = Number(request.tarifa_ctvs);
        if (!Number.isSafeInteger(total + shipping) || total + shipping <= 0)
          throw new ConflictException('El total debe ser positivo y seguro.');
        const [order] = await this.persistence.createDeliveryInsertPedido(m, {
          id: day.id,
          id2: account.id,
          userId: client.userId,
        });
        await this.persistence.createDeliveryInsertEntregaDomicilio(m, {
          id: order.id,
          requestId: requestId,
          version: request.version,
          comprobante_plazo_seg: settings.comprobante_plazo_seg,
        });
        const [version] = await this.persistence.createInsertVersionPedido(m, {
          id: order.id,
          total: total,
          notes: dto.notes ?? null,
        });
        for (const item of dto.items) {
          const product = products.find(
            (p) => p.id === item.productId.toLowerCase(),
          )!;
          const [detail] = await this.persistence.editInsertDetallePedido(m, {
            id: version.id,
            id2: product.id,
            quantity: item.quantity,
            price: product.price,
            tracks: product.tracks,
            notes: item.notes ?? null,
          });
          await this.persistence.createInsertAsignacionConsumo(m, {
            id: detail.id,
            id2: account.id,
            quantity: item.quantity,
          });
          if (product.tracks) {
            const stock = inventory.find((i) => i.product === product.id)!;
            await this.persistence.editUpdateInventarioDiarioNext(m, {
              id: stock.id,
              quantity: item.quantity,
            });
            await this.persistence.editInsertReservaInventario(m, {
              id: detail.id,
              id2: stock.id,
              quantity: item.quantity,
            });
          }
        }
        await this.persistence.createInsertHistorialPedido(m, {
          id: order.id,
          versionId: version.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
          actorType: actor.guestSessionId ? 'sesion_cliente' : 'usuario',
        });
        const [bill] = await this.persistence.createDeliveryInsertLiquidacion(
          m,
          {
            id: account.id,
            cash: day.cash,
            total: total,
            shipping: shipping,
            total5: total + shipping,
            userId: client.userId,
          },
        );
        await this.persistence.createDeliveryInsertDetalleLiquidacion(m, {
          id: bill.id,
          id2: account.id,
        });
        await auditTableOperation(
          m,
          actor,
          'pedido',
          order.id,
          'delivery.order_submitted',
          {
            requestId,
            accountId: account.id,
            settlementId: bill.id,
            totalCents: total + shipping,
          },
        );
        return {
          resourceId: order.id,
          response: await this.detail(order.id, client.clientId, false, m),
        };
      },
    );
  }

  async detail(
    id: string,
    clientId?: string,
    history = false,
    m: EntityManager = this.db.manager,
  ) {
    return this.queries.detail(id, clientId, history, m);
  }

  async history(id: string, clientId?: string) {
    return this.queries.history(id, clientId);
  }

  async list(query: OrderQueryDto | AdminOrderQueryDto, clientId?: string) {
    return this.queries.list(query, clientId);
  }
}
