import { forEachSequential } from '../common/async/for-each-sequential.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { type ClientIdentity } from '../common/identity/client-access.guard.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../operations/entities/operations-settings.entity.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { DeliveryPushStore } from '../database/delivery-push.store.js';
import { type AdminDeliveryListDto } from './dto/admin-delivery-list.dto.js';
import { type DeliveryListDto } from './dto/delivery-list.dto.js';
import { type DeliveryRequestDto } from './dto/delivery-request.dto.js';
import { type DeliverySettingsDto } from './dto/delivery-settings.dto.js';
import { DeliveryDetails } from './entities/delivery-details.entity.js';
import { DeliveryRequest } from './entities/delivery-request.entity.js';
import { DeliverySettings } from './entities/delivery-settings.entity.js';
import {
  ActiveDayFindJornadaOperativaRow,
  CreateInsertSolicitudDomicilioRow,
  DetailFindConfigDomicilioRow,
  SettingsFindConfigDomicilioRow,
  TransitionFindEntregaDomicilioRow,
  TransitionFindSolicitudDomicilioRow,
  UpdateSettingsInsertConfigDomicilioRow,
} from './types/delivery.types.js';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(DeliveryRequest)
    private readonly records: Repository<DeliveryRequest>,
    private readonly keys: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
    private readonly push: DeliveryPushStore,
  ) {}

  private async staff(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
    permission: string,
  ) {
    await this.authorization.requirePermission(m, actor, permission, {
      permissionMessage: 'No tienes permiso para realizar esta acción.',
    });
  }

  async settings(m: EntityManager = this.records.manager) {
    const [row] = await this.settingsFindConfigDomicilio(m);
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
      {
        authorize: (m) => this.staff(m, actor, 'delivery.configure'),
        action: async (m) => {
          await this.operationalContext.lockTableOperations(m);
          const before = await this.settings(m);
          const [row] = await this.updateSettingsInsertConfigDomicilio(m, {
            version: before.version + 1,
            enabled: dto.enabled,
            coverageDescription: dto.coverageDescription,
            shippingFeeCents: dto.shippingFeeCents,
            userId: actor.userId,
            receiptSubmissionSeconds: dto.receiptSubmissionSeconds,
          });
          const response = await this.settings(m);
          await this.auditLog.append(
            m,
            { userId: actor.userId },
            'config_domicilio',
            row.id,
            'delivery.settings_updated',
            { before, after: response },
          );
          return { resourceId: row.id, response };
        },
      },
    );
  }

  private async activeDay(m: EntityManager, zone: string) {
    const [day] = await this.activeDayFindJornadaOperativa(m, {
      zone,
    });
    if (!day)
      throw new ConflictException('Se requiere la jornada actual abierta.');
    return day.id as string;
  }

  async detail(
    id: string,
    clientId?: string,
    m: EntityManager = this.records.manager,
  ) {
    const [row] = await this.detailFindConfigDomicilio(m, {
      id,
      clientId: clientId ?? null,
    });
    if (!row)
      throw new NotFoundException('Solicitud de domicilio no encontrada.');
    return row;
  }

  async list(query: DeliveryListDto, clientId?: string) {
    const { rows, total } = await this.listRequestIds(
      this.records.manager,
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
      {
        authorize: (m) => this.participants.authenticate(m, client),
        action: async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const settings = await this.settings(m);
          const day = await this.activeDay(m, zone);
          if (
            !settings.enabled ||
            settings.version !== dto.configurationVersion
          )
            throw new ConflictException(
              'Configuración de domicilio deshabilitada o desactualizada.',
            );
          const [row] = await this.createInsertSolicitudDomicilio(m, {
            clientId: client.clientId,
            day,
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
          await this.auditLog.append(
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
      {
        authorize: async (m) => {
          if (client) {
            await this.participants.authenticate(m, client);
            await this.detail(id, client.clientId, m);
          } else await this.staff(m, actor, 'delivery.review');
        },
        action: async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const settings = await this.settings(m);
          const day =
            action === 'approve' ? await this.activeDay(m, zone) : null;
          const [row] = await this.transitionFindSolicitudDomicilio(m, {
            id,
          });
          if (!row)
            throw new NotFoundException(
              'Solicitud de domicilio no encontrada.',
            );
          const [used] = await this.transitionFindEntregaDomicilio(m, { id });
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
          const status = (
            {
              approve: 'approved',
              reject: 'rejected',
              cancel: 'cancelled',
            } as const
          )[action];
          await this.transitionUpdateSolicitudDomicilio(m, {
            id,
            status,
            userId: actor.userId,
            reason: reason ?? null,
          });
          const response = await this.detail(id, client?.clientId, m);
          if (status === 'approved' || status === 'rejected') {
            await this.push.enqueue(m, id, response.clientId, status);
          }
          await this.auditLog.append(
            m,
            { userId: actor.userId },
            'solicitud_domicilio',
            id,
            `delivery.${action}`,
            { before: row.estado, after: status, reason: reason ?? null },
          );
          return { resourceId: id, response };
        },
      },
    );
  }

  async cancelUnusedForOperatingDay(
    manager: EntityManager,
    dayId: string,
    actor: AuthenticatedRequestContext,
  ) {
    const rows = await this.queryCancelUnusedForOperatingDay(
      manager,
      dayId,
      actor.userId,
    );
    await forEachSequential(rows, async (row) => {
      await this.auditLog.append(
        manager,
        { userId: actor.userId },
        'solicitud_domicilio',
        row.id,
        'delivery.operating_day_closed',
        {
          operatingDayId: dayId,
          clientId: row.clientId,
          before: row.oldStatus,
          after: 'cancelled',
        },
      );
    });
    return rows.length;
  }

  private async queryCancelUnusedForOperatingDay(
    manager: EntityManager,
    dayId: string,
    _userId: string,
  ): Promise<Array<{ id: string; clientId: string; oldStatus: string }>> {
    const targets = await manager
      .getRepository(DeliveryRequest)
      .createQueryBuilder('s')
      .select('s.id_solicitud', 'id')
      .addSelect('s.id_cliente', 'clientId')
      .addSelect('s.estado', 'oldStatus')
      .where('s.id_jornada=:day AND s.estado IN (:...states)', {
        day: dayId,
        states: ['pending', 'approved'],
      })
      .andWhere(
        'NOT EXISTS(SELECT 1 FROM entrega_domicilio e WHERE e.id_solicitud=s.id_solicitud)',
      )
      .orderBy('s.id_solicitud')
      .setLock('pessimistic_write')
      .getRawMany<{ id: string; clientId: string; oldStatus: string }>();
    if (targets.length)
      await manager
        .getRepository(DeliveryRequest)
        .createQueryBuilder()
        .update()
        .set({ estado: 'cancelled', cancelada_en: () => 'clock_timestamp()' })
        .where('id_solicitud IN (:...ids)', {
          ids: targets.map((row) => row.id),
        })
        .execute();
    return targets;
  }

  private settingsFindConfigDomicilio(
    manager: EntityManager,
  ): Promise<SettingsFindConfigDomicilioRow[]> {
    return manager
      .getRepository(DeliverySettings)
      .createQueryBuilder('config_domicilio')
      .select(
        'id_configuracion AS id, version, comprobante_plazo_seg AS "receiptSubmissionSeconds", habilitado AS enabled, cobertura AS "coverageDescription", tarifa_ctvs::float8 AS "shippingFeeCents", \'USD\' AS currency, configurada_por AS "configuredBy", creada_en AS "createdAt"',
      )
      .addOrderBy('version', 'DESC')
      .limit(1)
      .getRawMany<SettingsFindConfigDomicilioRow>();
  }

  private updateSettingsInsertConfigDomicilio(
    manager: EntityManager,
    input: {
      version: number;
      enabled: boolean;
      coverageDescription: string;
      shippingFeeCents: number;
      userId: string;
      receiptSubmissionSeconds: number;
    },
  ): Promise<UpdateSettingsInsertConfigDomicilioRow[]> {
    return manager
      .getRepository(DeliverySettings)
      .createQueryBuilder()
      .insert()
      .values([
        {
          version: input.version,
          habilitado: input.enabled,
          cobertura: input.coverageDescription,
          tarifa_ctvs: String(input.shippingFeeCents),
          configurada_por: input.userId,
          comprobante_plazo_seg: input.receiptSubmissionSeconds,
        },
      ])
      .returning('id_configuracion AS id')
      .execute()
      .then((result) => result.raw);
  }

  private activeDayFindJornadaOperativa(
    manager: EntityManager,
    input: { zone: string },
  ): Promise<ActiveDayFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('id_jornada AS id')
      .where(
        "estado='open' AND fecha_operativa=timezone(:zone,clock_timestamp())::date",
      )
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ zone: input.zone })
      .getRawMany<ActiveDayFindJornadaOperativaRow>();
  }

  private detailFindConfigDomicilio(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<DetailFindConfigDomicilioRow[]> {
    return manager
      .getRepository(DeliveryRequest)
      .createQueryBuilder('s')
      .select([
        's.id_solicitud AS id',
        's.id_cliente AS "clientId"',
        's.id_jornada AS "operatingDayId"',
        'c.version AS "configurationVersion"',
        's.destinatario AS "recipientName"',
        's.telefono AS phone',
        's.direccion AS address',
        's.referencias AS references',
        's.latitud AS latitude',
        's.longitud AS longitude',
        's.tarifa_ctvs::float8 AS "shippingFeeCents"',
        "'USD' AS currency",
        's.estado AS status',
        's.creada_en AS "createdAt"',
        's.decidida_en AS "decidedAt"',
        's.decidida_por AS "decidedBy"',
        's.motivo_rechazo AS "rejectionReason"',
        's.cancelada_en AS "cancelledAt"',
        "COALESCE(s.estado='approved' AND j.estado='open' AND j.fecha_operativa=timezone(op.zona_horaria,clock_timestamp())::date AND c.version=(SELECT max(version) FROM config_domicilio) AND c.habilitado,false) AS \"usableToday\"",
      ])
      .innerJoin(DeliverySettings, 'c', 'c.id_configuracion=s.id_configuracion')
      .innerJoin(OperatingDay, 'j', 'j.id_jornada=s.id_jornada')
      .innerJoin(OperationsSettings, 'op', 'op.id_configuracion=1')
      .where(
        's.id_solicitud=:id AND (:clientId::uuid IS NULL OR s.id_cliente=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<DetailFindConfigDomicilioRow>();
  }

  private createInsertSolicitudDomicilio(
    manager: EntityManager,
    input: {
      clientId: string;
      day: string;
      id: string;
      recipientName: string;
      phone: string;
      address: string;
      references: string | null;
      latitude: number | null;
      longitude: number | null;
      shippingFeeCents: number;
    },
  ): Promise<CreateInsertSolicitudDomicilioRow[]> {
    return manager
      .getRepository(DeliveryRequest)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.clientId,
          id_jornada: input.day,
          id_configuracion: input.id,
          destinatario: input.recipientName,
          telefono: input.phone,
          direccion: input.address,
          referencias: input.references,
          latitud: input.latitude,
          longitud: input.longitude,
          tarifa_ctvs: String(input.shippingFeeCents),
        },
      ])
      .returning('id_solicitud AS id')
      .execute()
      .then((result) => result.raw);
  }

  private transitionFindSolicitudDomicilio(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindSolicitudDomicilioRow[]> {
    return manager
      .getRepository(DeliveryRequest)
      .createQueryBuilder('s')
      .select('s.estado, s.id_jornada, s.id_configuracion, c.version')
      .innerJoin(DeliverySettings, 'c', 'c.id_configuracion=s.id_configuracion')
      .where('s.id_solicitud=:id')
      .setLock('pessimistic_write', undefined, ['s'])
      .setParameters({ id: input.id })
      .getRawMany<TransitionFindSolicitudDomicilioRow>();
  }

  private transitionFindEntregaDomicilio(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindEntregaDomicilioRow[]> {
    return manager
      .getRepository(DeliveryDetails)
      .createQueryBuilder('entrega_domicilio')
      .select('1 AS "1"')
      .where('id_solicitud=:id')
      .setParameters({ id: input.id })
      .getRawMany<TransitionFindEntregaDomicilioRow>();
  }

  private async transitionUpdateSolicitudDomicilio(
    manager: EntityManager,
    input: {
      id: string;
      status: 'approved' | 'rejected' | 'cancelled';
      userId: string;
      reason: string | null;
    },
  ): Promise<void> {
    await manager
      .getRepository(DeliveryRequest)
      .createQueryBuilder()
      .update(DeliveryRequest)
      .set({
        estado: () => ':status::varchar',
        decidida_en: () =>
          "CASE WHEN :status::varchar IN ('approved','rejected') THEN clock_timestamp() ELSE decidida_en END",
        decidida_por: () =>
          "CASE WHEN :status::varchar IN ('approved','rejected') THEN :userId::uuid ELSE decidida_por END",
        motivo_rechazo: () =>
          "CASE WHEN :status::varchar='rejected' THEN :reason::varchar ELSE motivo_rechazo END",
        cancelada_en: () =>
          "CASE WHEN :status::varchar='cancelled' THEN clock_timestamp() ELSE cancelada_en END",
      })
      .where('id_solicitud=:id')
      .setParameters({
        id: input.id,
        status: input.status,
        userId: input.userId,
        reason: input.reason,
      })
      .execute();
  }

  private async listRequestIds(
    manager: EntityManager,
    query: DeliveryListDto,
    clientId?: string,
  ) {
    const admin = query as AdminDeliveryListDto;
    const args = [
      clientId ?? admin.clientId ?? null,
      query.status ?? null,
      admin.operatingDayId ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(DeliveryRequest)
      .createQueryBuilder('solicitud_domicilio')
      .select('count(*)::int AS total')
      .where(
        '(:p1::uuid IS NULL OR id_cliente=:p1) AND (:p2::text IS NULL OR estado=:p2) AND (:p3::uuid IS NULL OR id_jornada=:p3)',
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
      .getRepository(DeliveryRequest)
      .createQueryBuilder('solicitud_domicilio')
      .select('id_solicitud AS id')
      .where(
        '(:p1::uuid IS NULL OR id_cliente=:p1) AND (:p2::text IS NULL OR estado=:p2) AND (:p3::uuid IS NULL OR id_jornada=:p3)',
      )
      .addOrderBy('creada_en', 'DESC')
      .addOrderBy('id_solicitud', 'DESC')
      .limit(Number(queryValues2[3]))
      .offset(Number(queryValues2[4]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { rows, total };
  }
}
