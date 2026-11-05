import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import type { ClientIdentity } from './client-access.guard.js';
import type {
  DeliveryListDto,
  DeliveryRequestDto,
  DeliverySettingsDto,
} from './delivery.dto.js';
import { ParticipantsService } from './participants.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { DeliveryRepository } from './repositories/delivery.repository.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly db: DataSource,
    private readonly keys: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly persistence: DeliveryRepository = new DeliveryRepository(),
  ) {}

  private async staff(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
    permission: string,
  ) {
    const [session] = await this.persistence.staffFindUsuario(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
    if (!session || !session.activo || session.revocada_en || !session.valid)
      throw new UnauthorizedException('Sesión no válida.');
    const [p] = await this.persistence.staffFindUsuarioNext(m, {
      userId: actor.userId,
      permission: permission,
    });
    if (!p)
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción.',
      );
  }

  async settings(m: EntityManager = this.db.manager) {
    const [row] = await this.persistence.settingsFindConfigDomicilio(m);
    return row;
  }

  async updateSettings(
    dto: DeliverySettingsDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.keys.run(
      { userId: actor.userId },
      'delivery/settings',
      key,
      dto,
      200,
      'config_domicilio',
      (m) => this.staff(m, actor, 'delivery.configure'),
      async (m) => {
        await lockTableOperations(m);
        const before = await this.settings(m);
        const [row] =
          await this.persistence.updateSettingsInsertConfigDomicilio(m, {
            version: before.version + 1,
            enabled: dto.enabled,
            coverageDescription: dto.coverageDescription,
            shippingFeeCents: dto.shippingFeeCents,
            userId: actor.userId,
            receiptSubmissionSeconds: dto.receiptSubmissionSeconds,
          });
        const response = await this.settings(m);
        await auditTableOperation(
          m,
          { userId: actor.userId },
          'config_domicilio',
          row.id,
          'delivery.settings_updated',
          { before, after: response },
        );
        return { resourceId: row.id, response };
      },
    );
  }

  private async activeDay(m: EntityManager, zone: string) {
    const [day] = await this.persistence.activeDayFindJornadaOperativa(m, {
      zone: zone,
    });
    if (!day)
      throw new ConflictException('Se requiere la jornada actual abierta.');
    return day.id as string;
  }

  async detail(
    id: string,
    clientId?: string,
    m: EntityManager = this.db.manager,
  ) {
    const [row] = await this.persistence.detailFindConfigDomicilio(m, {
      id: id,
      clientId: clientId ?? null,
    });
    if (!row)
      throw new NotFoundException('Solicitud de domicilio no encontrada.');
    return row;
  }

  async list(query: DeliveryListDto, clientId?: string) {
    const { rows, total } = await this.persistence.listRequestIds(
      this.db.manager,
      query,
      clientId,
    );
    return {
      items: await Promise.all(
        rows.map((row) => this.detail(row.id, clientId)),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async create(dto: DeliveryRequestDto, client: ClientIdentity, key?: string) {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined))
      throw new BadRequestException(
        'Latitud y longitud deben enviarse juntas.',
      );
    return this.keys.run(
      { userId: client.userId },
      'me/delivery-requests',
      key,
      dto,
      201,
      'solicitud_domicilio',
      (m) => this.participants.authenticate(m, client),
      async (m) => {
        const zone = await lockTableOperations(m);
        const settings = await this.settings(m);
        const day = await this.activeDay(m, zone);
        if (!settings.enabled || settings.version !== dto.configurationVersion)
          throw new ConflictException(
            'Configuración de domicilio deshabilitada o desactualizada.',
          );
        const [row] = await this.persistence.createInsertSolicitudDomicilio(m, {
          clientId: client.clientId,
          day: day,
          id: settings.id,
          recipientName: dto.recipientName,
          phone: dto.phone,
          address: dto.address,
          references: dto.references ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          shippingFeeCents: settings.shippingFeeCents,
        });
        const response = await this.detail(row.id, client.clientId, m);
        await auditTableOperation(
          m,
          { userId: client.userId },
          'solicitud_domicilio',
          row.id,
          'delivery.requested',
          {
            clientId: client.clientId,
            configurationVersion: settings.version,
            shippingFeeCents: settings.shippingFeeCents,
          },
        );
        return { resourceId: row.id, response };
      },
    );
  }

  async transition(
    id: string,
    action: 'approve' | 'reject' | 'cancel',
    actor: AuthenticatedRequestContext,
    client: ClientIdentity | undefined,
    reason: string | undefined,
    key?: string,
  ) {
    return this.keys.run(
      { userId: actor.userId },
      `delivery-requests/${id.toLowerCase()}/${action}`,
      key,
      { reason: reason ?? null },
      200,
      'solicitud_domicilio',
      async (m) => {
        if (client) {
          await this.participants.authenticate(m, client);
          await this.detail(id, client.clientId, m);
        } else await this.staff(m, actor, 'delivery.review');
      },
      async (m) => {
        const zone = await lockTableOperations(m);
        const settings = await this.settings(m);
        const day = action === 'approve' ? await this.activeDay(m, zone) : null;
        const [row] = await this.persistence.transitionFindSolicitudDomicilio(
          m,
          { id: id },
        );
        if (!row)
          throw new NotFoundException('Solicitud de domicilio no encontrada.');
        const [used] = await this.persistence.transitionFindEntregaDomicilio(
          m,
          { id: id },
        );
        if (used)
          throw new ConflictException(
            'La solicitud ya está vinculada a un pedido.',
          );
        if (
          action === 'cancel'
            ? !['pending', 'approved'].includes(row.estado)
            : row.estado !== 'pending'
        )
          throw new ConflictException(
            'La solicitud no permite esa transición.',
          );
        if (
          action === 'approve' &&
          (!settings.enabled ||
            settings.version !== row.version ||
            day !== row.id_jornada)
        )
          throw new ConflictException(
            'La solicitud pertenece a otra jornada o configuración.',
          );
        const status =
          action === 'approve'
            ? 'approved'
            : action === 'reject'
              ? 'rejected'
              : 'cancelled';
        await this.persistence.transitionUpdateSolicitudDomicilio(m, {
          id: id,
          status: status,
          userId: actor.userId,
          reason: reason ?? null,
        });
        const response = await this.detail(id, client?.clientId, m);
        await auditTableOperation(
          m,
          { userId: actor.userId },
          'solicitud_domicilio',
          id,
          `delivery.${action}`,
          { before: row.estado, after: status, reason: reason ?? null },
        );
        return { resourceId: id, response };
      },
    );
  }
}
