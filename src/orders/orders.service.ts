import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { ConsumptionAssignment } from '../accounts/entities/consumption-assignment.entity.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { Category } from '../catalog/entities/category.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { type ClientIdentity } from '../common/identity/client-access.guard.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { DeliveryDetails } from '../delivery/entities/delivery-details.entity.js';
import { DeliveryRequest } from '../delivery/entities/delivery-request.entity.js';
import { DeliverySettings } from '../delivery/entities/delivery-settings.entity.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../operations/entities/operations-settings.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { SettlementItem } from '../settlements/entities/settlement-item.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { type CreateOrderDto } from './dto/create-order.dto.js';
import { OrderHistory } from './entities/order-history.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrderVersion } from './entities/order-version.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderInventoryService } from './order-inventory.service.js';
import { OrdersQueryService } from './orders-query.service.js';
import {
  CreateDeliveryFindConfigDomicilioRow,
  CreateDeliveryFindEntregaDomicilioRow,
  CreateDeliveryFindJornadaOperativaRow,
  CreateDeliveryFindSolicitudDomicilioNextRow,
  CreateDeliveryFindSolicitudDomicilioRow,
  CreateDeliveryInsertCuentaConsumoRow,
  CreateDeliveryInsertLiquidacionRow,
  CreateDeliveryInsertPedidoRow,
  CreateFindCajaRow,
  CreateFindParticipanteNextRow,
  CreateFindParticipanteRow,
  CreateInsertPedidoRow,
  CreateInsertVersionPedidoRow,
  EditFindLiquidacionRow,
  EditFindProductoRow,
  EditInsertDetallePedidoRow,
} from './types/orders.types.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly records: Repository<Order>,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly config: ConfigService,
    private readonly queries: OrdersQueryService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly inventoryOperations: OrderInventoryService,
  ) {}

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
        const [own] = await this.createFindParticipante(m, {
          visitId,
          clientId: client.clientId,
        });
        if (!own) throw new NotFoundException('Participación no encontrada.');
      },
      async (m) => {
        const zone = await this.operationalContext.lockTableOperations(m);
        await this.operationalContext.lockActiveVisit(m, visitId, zone);
        const [account] = await this.createFindParticipanteNext(m, {
          visitId,
          clientId: client.clientId,
        });
        if (!account)
          throw new ConflictException(
            'Se requiere una participación aprobada y cuenta abierta.',
          );
        const [cash] = await this.createFindCaja(m, {
          day: account.day,
        });
        if (cash?.estado === 'closed')
          throw new ConflictException('La caja de la jornada ya fue cerrada.');
        const [pending] = await this.editFindLiquidacion(m, {
          id_cuenta: account.id,
        });
        if (pending)
          throw new ConflictException(
            'La cuenta tiene una liquidación pendiente.',
          );
        const products: Array<{ id: string; price: number; tracks: boolean }> =
          await this.editFindProducto(m, { ids });
        if (products.length !== ids.length)
          throw new ConflictException(
            'Uno o más productos no están disponibles.',
          );
        const inventory: Array<{
          id: string;
          product: string;
          available: number;
        }> = await this.inventoryOperations.lockAvailableInventory(m, {
          operatingDayId: account.day,
          productIds: ids,
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
        const [order] = await this.createInsertPedido(m, {
          day: account.day,
          visitId,
          id: account.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
        });
        const [version] = await this.createInsertVersionPedido(m, {
          id: order.id,
          total,
          notes: dto.notes ?? null,
        });
        for (const item of dto.items) {
          const product = products.find(
            (p) => p.id === item.productId.toLowerCase(),
          )!;
          const [detail] = await this.editInsertDetallePedido(m, {
            id: version.id,
            id2: product.id,
            quantity: item.quantity,
            price: product.price,
            tracks: product.tracks,
            notes: item.notes ?? null,
          });
          await this.createInsertAsignacionConsumo(m, {
            id: detail.id,
            id2: account.id,
            quantity: item.quantity,
          });
          if (product.tracks) {
            const stock = inventory.find((i) => i.product === product.id)!;
            await this.inventoryOperations.increaseReservedQuantity(m, {
              inventoryId: stock.id,
              quantity: item.quantity,
            });
            await this.inventoryOperations.createReservation(m, {
              orderItemId: detail.id,
              inventoryId: stock.id,
              quantity: item.quantity,
            });
          }
        }
        await this.createInsertHistorialPedido(m, {
          id: order.id,
          versionId: version.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
          actorType: actor.guestSessionId ? 'sesion_cliente' : 'usuario',
        });
        await this.auditLog.append(
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
        const [own] = await this.createDeliveryFindSolicitudDomicilio(m, {
          requestId,
          clientId: client.clientId,
        });
        if (!own) throw new NotFoundException('Solicitud no encontrada.');
      },
      async (m) => {
        if (!this.config.get<boolean>('TRANSFER_PAYMENTS_ENABLED', false))
          throw new ServiceUnavailableException(
            'Las transferencias están deshabilitadas.',
          );
        const zone = await this.operationalContext.lockTableOperations(m);
        const [day] = await this.createDeliveryFindJornadaOperativa(m, {
          zone,
        });
        if (!day)
          throw new ConflictException(
            'Se requiere jornada y caja actuales abiertas.',
          );
        const [request] = await this.createDeliveryFindSolicitudDomicilioNext(
          m,
          {
            requestId,
          },
        );
        const [settings] = await this.createDeliveryFindConfigDomicilio(m);
        const [used] = await this.createDeliveryFindEntregaDomicilio(m, {
          requestId,
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
        const [account] = await this.createDeliveryInsertCuentaConsumo(m, {
          clientId: client.clientId,
          id: day.id,
        });
        const products: Array<{ id: string; price: number; tracks: boolean }> =
          await this.editFindProducto(m, { ids });
        if (products.length !== ids.length)
          throw new ConflictException(
            'Uno o más productos no están disponibles.',
          );
        const inventory: Array<{
          id: string;
          product: string;
          available: number;
        }> = await this.inventoryOperations.lockAvailableInventory(m, {
          operatingDayId: account.day,
          productIds: ids,
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
        const [order] = await this.createDeliveryInsertPedido(m, {
          id: day.id,
          id2: account.id,
          userId: client.userId,
        });
        await this.createDeliveryInsertEntregaDomicilio(m, {
          id: order.id,
          requestId,
          version: request.version,
          comprobante_plazo_seg: settings.comprobante_plazo_seg,
        });
        const [version] = await this.createInsertVersionPedido(m, {
          id: order.id,
          total,
          notes: dto.notes ?? null,
        });
        for (const item of dto.items) {
          const product = products.find(
            (p) => p.id === item.productId.toLowerCase(),
          )!;
          const [detail] = await this.editInsertDetallePedido(m, {
            id: version.id,
            id2: product.id,
            quantity: item.quantity,
            price: product.price,
            tracks: product.tracks,
            notes: item.notes ?? null,
          });
          await this.createInsertAsignacionConsumo(m, {
            id: detail.id,
            id2: account.id,
            quantity: item.quantity,
          });
          if (product.tracks) {
            const stock = inventory.find((i) => i.product === product.id)!;
            await this.inventoryOperations.increaseReservedQuantity(m, {
              inventoryId: stock.id,
              quantity: item.quantity,
            });
            await this.inventoryOperations.createReservation(m, {
              orderItemId: detail.id,
              inventoryId: stock.id,
              quantity: item.quantity,
            });
          }
        }
        await this.createInsertHistorialPedido(m, {
          id: order.id,
          versionId: version.id,
          userId: actor.userId ?? null,
          guestSessionId: actor.guestSessionId ?? null,
          actorType: actor.guestSessionId ? 'sesion_cliente' : 'usuario',
        });
        const [bill] = await this.createDeliveryInsertLiquidacion(m, {
          id: account.id,
          cash: day.cash,
          total,
          shipping,
          total5: total + shipping,
          userId: client.userId,
        });
        await this.createDeliveryInsertDetalleLiquidacion(m, {
          id: bill.id,
          id2: account.id,
        });
        await this.auditLog.append(
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
    m: EntityManager = this.records.manager,
  ) {
    return this.queries.detail(id, clientId, history, m);
  }

  private async editFindLiquidacion(
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

  private async editFindProducto(
    manager: EntityManager,
    input: { ids: string[] },
  ): Promise<EditFindProductoRow[]> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select([
        'p.id_producto AS id',
        'p.precio_ctvs AS price',
        'p.controla_inventario AS tracks',
      ])
      .innerJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where(
        'p.id_producto=ANY(:ids::uuid[]) AND p.activo AND p.visible_menu AND c.activa',
      )
      .addOrderBy('p.id_producto', 'ASC')
      .setLock('pessimistic_read', undefined, ['p', 'c'])
      .setParameters({ ids: input.ids })
      .getRawMany<EditFindProductoRow>();
  }

  private async editInsertDetallePedido(
    manager: EntityManager,
    input: {
      id: string;
      id2: string;
      quantity: number;
      price: number;
      tracks: boolean;
      notes: string | null;
    },
  ): Promise<EditInsertDetallePedidoRow[]> {
    return manager
      .getRepository(OrderItem)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_version: input.id,
          id_producto: input.id2,
          cantidad: input.quantity,
          precio_unitario_ctvs: input.price,
          controla_stock_snapshot: input.tracks,
          observaciones: input.notes,
        },
      ])
      .returning('id_detalle AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async createFindParticipante(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<CreateFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select('1 AS "1"')
      .where('id_visita=:visitId AND id_cliente=:clientId')
      .setParameters({ visitId: input.visitId, clientId: input.clientId })
      .getRawMany<CreateFindParticipanteRow>();
  }

  private async createFindParticipanteNext(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<CreateFindParticipanteNextRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('p')
      .select(['c.id_cuenta AS id', 'c.id_jornada AS day'])
      .innerJoin(ConsumptionAccount, 'c', 'c.id_participante=p.id_participante')
      .where(
        "p.id_visita=:visitId AND p.id_cliente=:clientId AND p.estado='approved' AND c.estado='open'",
      )
      .setLock('pessimistic_write', undefined, ['p', 'c'])
      .setParameters({ visitId: input.visitId, clientId: input.clientId })
      .getRawMany<CreateFindParticipanteNextRow>();
  }

  private async createFindCaja(
    manager: EntityManager,
    input: { day: string },
  ): Promise<CreateFindCajaRow[]> {
    return manager
      .getRepository(CashRegister)
      .createQueryBuilder('caja')
      .select('estado AS "estado"')
      .where('id_jornada=:day')
      .setParameters({ day: input.day })
      .getRawMany<CreateFindCajaRow>();
  }

  private async createInsertPedido(
    manager: EntityManager,
    input: {
      day: string;
      visitId: string;
      id: string;
      userId: string | null;
      guestSessionId: string | null;
    },
  ): Promise<CreateInsertPedidoRow[]> {
    const settings = await manager
      .getRepository(OperationsSettings)
      .findOneByOrFail({ id_configuracion: 1 });
    const result = await manager
      .getRepository(Order)
      .createQueryBuilder()
      .insert()
      .values({
        id_jornada: input.day,
        id_visita: input.visitId,
        id_cuenta: input.id,
        actor_usuario: input.userId,
        actor_sesion_cliente: input.guestSessionId,
        editable_hasta: () =>
          'clock_timestamp()+make_interval(secs => :seconds)',
      })
      .setParameter('seconds', settings.edicion_local_seg)
      .returning('id_pedido AS id')
      .execute();
    return result.raw as CreateInsertPedidoRow[];
  }

  private async createInsertVersionPedido(
    manager: EntityManager,
    input: { id: string; total: number; notes: string | null },
  ): Promise<CreateInsertVersionPedidoRow[]> {
    return manager
      .getRepository(OrderVersion)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_pedido: input.id,
          numero: 1,
          estado: 'current',
          total_productos_ctvs: String(input.total),
          observaciones: input.notes,
        },
      ])
      .returning('id_version AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async createInsertAsignacionConsumo(
    manager: EntityManager,
    input: { id: string; id2: string; quantity: number },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_detalle: input.id,
          id_cuenta: input.id2,
          cantidad: input.quantity,
        },
      ])
      .execute();
  }

  private async createInsertHistorialPedido(
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
          evento: 'order.submitted',
          estado_nuevo: 'submitted',
        },
      ])
      .execute();
  }

  private async createDeliveryFindSolicitudDomicilio(
    manager: EntityManager,
    input: { requestId: string; clientId: string },
  ): Promise<CreateDeliveryFindSolicitudDomicilioRow[]> {
    return manager
      .getRepository(DeliveryRequest)
      .createQueryBuilder('solicitud_domicilio')
      .select('1 AS "1"')
      .where('id_solicitud=:requestId AND id_cliente=:clientId')
      .setParameters({ requestId: input.requestId, clientId: input.clientId })
      .getRawMany<CreateDeliveryFindSolicitudDomicilioRow>();
  }

  private async createDeliveryFindJornadaOperativa(
    manager: EntityManager,
    input: { zone: string },
  ): Promise<CreateDeliveryFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('j')
      .select(['j.id_jornada AS id', 'c.id_caja AS cash'])
      .innerJoin(CashRegister, 'c', 'c.id_jornada=j.id_jornada')
      .where(
        "j.estado='open' AND c.estado='open' AND j.fecha_operativa=timezone(:zone,clock_timestamp())::date",
      )
      .setLock('pessimistic_write', undefined, ['j', 'c'])
      .setParameters({ zone: input.zone })
      .getRawMany<CreateDeliveryFindJornadaOperativaRow>();
  }

  private async createDeliveryFindSolicitudDomicilioNext(
    manager: EntityManager,
    input: { requestId: string },
  ): Promise<CreateDeliveryFindSolicitudDomicilioNextRow[]> {
    return manager
      .getRepository(DeliveryRequest)
      .createQueryBuilder('s')
      .select('s.*, cfg.version')
      .innerJoin(
        DeliverySettings,
        'cfg',
        'cfg.id_configuracion=s.id_configuracion',
      )
      .where('s.id_solicitud=:requestId')
      .setLock('pessimistic_write', undefined, ['s'])
      .setParameters({ requestId: input.requestId })
      .getRawMany<CreateDeliveryFindSolicitudDomicilioNextRow>();
  }

  private async createDeliveryFindConfigDomicilio(
    manager: EntityManager,
  ): Promise<CreateDeliveryFindConfigDomicilioRow[]> {
    return manager
      .getRepository(DeliverySettings)
      .createQueryBuilder('config_domicilio')
      .select([
        '"config_domicilio"."cobertura" AS "cobertura"',
        '"config_domicilio"."id_configuracion" AS "id_configuracion"',
        '"config_domicilio"."habilitado" AS "habilitado"',
        '"config_domicilio"."creada_en" AS "creada_en"',
        '"config_domicilio"."comprobante_plazo_seg" AS "comprobante_plazo_seg"',
        '"config_domicilio"."configurada_por" AS "configurada_por"',
        '"config_domicilio"."tarifa_ctvs" AS "tarifa_ctvs"',
        '"config_domicilio"."version" AS "version"',
      ])
      .addOrderBy('version', 'DESC')
      .limit(1)
      .getRawMany<CreateDeliveryFindConfigDomicilioRow>();
  }

  private async createDeliveryFindEntregaDomicilio(
    manager: EntityManager,
    input: { requestId: string },
  ): Promise<CreateDeliveryFindEntregaDomicilioRow[]> {
    return manager
      .getRepository(DeliveryDetails)
      .createQueryBuilder('entrega_domicilio')
      .select('1 AS "1"')
      .where('id_solicitud=:requestId')
      .setParameters({ requestId: input.requestId })
      .getRawMany<CreateDeliveryFindEntregaDomicilioRow>();
  }

  private async createDeliveryInsertCuentaConsumo(
    manager: EntityManager,
    input: { clientId: string; id: string },
  ): Promise<CreateDeliveryInsertCuentaConsumoRow[]> {
    return manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.clientId,
          id_jornada: input.id,
          modalidad: 'delivery',
        },
      ])
      .returning('id_cuenta AS id,id_jornada AS day')
      .execute()
      .then((result) => result.raw);
  }

  private async createDeliveryInsertPedido(
    manager: EntityManager,
    input: { id: string; id2: string; userId: string | undefined },
  ): Promise<CreateDeliveryInsertPedidoRow[]> {
    return manager
      .getRepository(Order)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_jornada: input.id,
          id_cuenta: input.id2,
          actor_usuario: input.userId,
          modalidad: 'delivery',
        },
      ])
      .returning('id_pedido AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async createDeliveryInsertEntregaDomicilio(
    manager: EntityManager,
    input: {
      id: string;
      requestId: string;
      version: number;
      comprobante_plazo_seg: number;
    },
  ): Promise<void> {
    const request = await manager
      .getRepository(DeliveryRequest)
      .findOneBy({ id_solicitud: input.requestId });
    if (!request) return;
    await manager
      .getRepository(DeliveryDetails)
      .createQueryBuilder()
      .insert()
      .values({
        id_pedido: input.id,
        id_solicitud: request.id_solicitud,
        destinatario: request.destinatario,
        telefono: request.telefono,
        direccion: request.direccion,
        referencias: request.referencias,
        latitud: request.latitud,
        longitud: request.longitud,
        version_configuracion: input.version,
        tarifa_ctvs: String(request.tarifa_ctvs),
        comprobante_hasta: () =>
          'clock_timestamp()+make_interval(secs => :seconds)',
      })
      .setParameter('seconds', input.comprobante_plazo_seg)
      .execute();
  }

  private async createDeliveryInsertLiquidacion(
    manager: EntityManager,
    input: {
      id: string;
      cash: string;
      total: number;
      shipping: number;
      total5: number;
      userId: string | undefined;
    },
  ): Promise<CreateDeliveryInsertLiquidacionRow[]> {
    return manager
      .getRepository(Settlement)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cuenta: input.id,
          id_caja: input.cash,
          productos_ctvs: String(input.total),
          envio_ctvs: String(input.shipping),
          total_ctvs: String(input.total5),
          creada_por: input.userId,
        },
      ])
      .returning('id_liquidacion AS id')
      .execute()
      .then((result) => result.raw);
  }

  private async createDeliveryInsertDetalleLiquidacion(
    manager: EntityManager,
    input: { id: string; id2: string },
  ): Promise<void> {
    const details = await manager
      .getRepository(ConsumptionAssignment)
      .createQueryBuilder('a')
      .innerJoin(OrderItem, 'd', 'd.id_detalle=a.id_detalle')
      .select('a.id_asignacion', 'id_asignacion')
      .addSelect('a.cantidad', 'cantidad_snapshot')
      .addSelect('d.precio_unitario_ctvs', 'precio_snapshot_ctvs')
      .addSelect('a.cantidad::bigint*d.precio_unitario_ctvs', 'importe_ctvs')
      .where('a.id_cuenta=:account', { account: input.id2 })
      .getRawMany<{
        id_asignacion: string;
        cantidad_snapshot: number;
        precio_snapshot_ctvs: number;
        importe_ctvs: string;
      }>();
    if (details.length)
      await manager
        .getRepository(SettlementItem)
        .createQueryBuilder()
        .insert()
        .values(
          details.map((detail) => ({ ...detail, id_liquidacion: input.id })),
        )
        .execute();
  }
}
