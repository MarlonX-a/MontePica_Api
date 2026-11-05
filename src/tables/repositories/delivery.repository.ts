import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';

import type { AdminDeliveryListDto, DeliveryListDto } from '../delivery.dto.js';

// Read builders

// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
import type { EntityManager } from 'typeorm';
export interface StaffFindUsuarioRow {
  activo: boolean;
  revocada_en: Date | null;
  valid: boolean;
}
export interface StaffFindUsuarioNextRow {
  '1': string;
}
export interface SettingsFindConfigDomicilioRow {
  id: string;
  version: number;
  receiptSubmissionSeconds: number;
  enabled: boolean;
  coverageDescription: string;
  shippingFeeCents: number;
  currency: string;
  configuredBy: string;
  createdAt: Date;
}
export interface UpdateSettingsInsertConfigDomicilioRow {
  id: string;
}
export interface ActiveDayFindJornadaOperativaRow {
  id: string;
}
export interface DetailFindConfigDomicilioRow {
  id: string;
  clientId: string;
  operatingDayId: string;
  configurationVersion: number;
  recipientName: string;
  phone: string;
  address: string;
  references: string;
  latitude: number;
  longitude: number;
  shippingFeeCents: number;
  currency: string;
  status: string;
  createdAt: Date;
  decidedAt: Date;
  decidedBy: string;
  rejectionReason: string;
  cancelledAt: Date;
  usableToday: boolean;
}
export interface ListFindSolicitudDomicilioRow {
  total: number;
}
export interface ListFindSolicitudDomicilioNextRow {
  id: string;
}
export interface CreateInsertSolicitudDomicilioRow {
  id: string;
}
export interface TransitionFindSolicitudDomicilioRow {
  estado: string;
  id_jornada: string;
  id_configuracion: string;
  version: number;
}
export interface TransitionFindEntregaDomicilioRow {
  '1': string;
}
export class DeliveryRepository {
  async staffFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<StaffFindUsuarioRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      undefined,
    );
    return row ? [row] : [];
  }
  async staffFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string; permission: string },
  ): Promise<StaffFindUsuarioNextRow[]> {
    return (await new AuthorizationRepository().hasPermission(
      manager,
      input.userId,
      input.permission,
    ))
      ? [{ '1': '1' }]
      : [];
  }
  async settingsFindConfigDomicilio(
    manager: EntityManager,
  ): Promise<SettingsFindConfigDomicilioRow[]> {
    return manager.query<SettingsFindConfigDomicilioRow[]>(
      `SELECT id_configuracion AS id,version,comprobante_plazo_seg AS "receiptSubmissionSeconds",habilitado AS enabled,cobertura AS "coverageDescription",tarifa_ctvs::float8 AS "shippingFeeCents",'USD' AS currency,configurada_por AS "configuredBy",creada_en AS "createdAt" FROM config_domicilio ORDER BY version DESC LIMIT 1`,
      [],
    );
  }
  async updateSettingsInsertConfigDomicilio(
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
    return manager.query<UpdateSettingsInsertConfigDomicilioRow[]>(
      `INSERT INTO config_domicilio(version,habilitado,cobertura,tarifa_ctvs,configurada_por,comprobante_plazo_seg) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_configuracion AS id`,
      [
        input.version,
        input.enabled,
        input.coverageDescription,
        input.shippingFeeCents,
        input.userId,
        input.receiptSubmissionSeconds,
      ],
    );
  }
  async activeDayFindJornadaOperativa(
    manager: EntityManager,
    input: { zone: string },
  ): Promise<ActiveDayFindJornadaOperativaRow[]> {
    return manager.query<ActiveDayFindJornadaOperativaRow[]>(
      `SELECT id_jornada AS id FROM jornada_operativa WHERE estado='open' AND fecha_operativa=timezone($1,clock_timestamp())::date FOR UPDATE`,
      [input.zone],
    );
  }
  async detailFindConfigDomicilio(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<DetailFindConfigDomicilioRow[]> {
    return manager.query<DetailFindConfigDomicilioRow[]>(
      `SELECT s.id_solicitud AS id,s.id_cliente AS "clientId",s.id_jornada AS "operatingDayId",c.version AS "configurationVersion",s.destinatario AS "recipientName",s.telefono AS phone,s.direccion AS address,s.referencias AS references,s.latitud AS latitude,s.longitud AS longitude,s.tarifa_ctvs::float8 AS "shippingFeeCents",'USD' AS currency,s.estado AS status,s.creada_en AS "createdAt",s.decidida_en AS "decidedAt",s.decidida_por AS "decidedBy",s.motivo_rechazo AS "rejectionReason",s.cancelada_en AS "cancelledAt",COALESCE(s.estado='approved' AND j.estado='open' AND j.fecha_operativa=timezone(op.zona_horaria,clock_timestamp())::date AND c.version=(SELECT max(version) FROM config_domicilio) AND c.habilitado,false) AS "usableToday" FROM solicitud_domicilio s JOIN config_domicilio c ON c.id_configuracion=s.id_configuracion JOIN jornada_operativa j ON j.id_jornada=s.id_jornada JOIN configuracion_operativa op ON op.id_configuracion=1 WHERE s.id_solicitud=$1 AND ($2::uuid IS NULL OR s.id_cliente=$2)`,
      [input.id, input.clientId],
    );
  }
  private async listFindSolicitudDomicilio(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListFindSolicitudDomicilioRow[]> {
    return manager.query<ListFindSolicitudDomicilioRow[]>(
      `SELECT count(*)::int AS total FROM solicitud_domicilio ${fragment0}`,
      parameters,
    );
  }
  private async listFindSolicitudDomicilioNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListFindSolicitudDomicilioNextRow[]> {
    return manager.query<ListFindSolicitudDomicilioNextRow[]>(
      `SELECT id_solicitud AS id FROM solicitud_domicilio ${fragment0} ORDER BY creada_en DESC,id_solicitud DESC LIMIT $4 OFFSET $5`,
      parameters,
    );
  }
  async createInsertSolicitudDomicilio(
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
    return manager.query<CreateInsertSolicitudDomicilioRow[]>(
      `INSERT INTO solicitud_domicilio(id_cliente,id_jornada,id_configuracion,destinatario,telefono,direccion,referencias,latitud,longitud,tarifa_ctvs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_solicitud AS id`,
      [
        input.clientId,
        input.day,
        input.id,
        input.recipientName,
        input.phone,
        input.address,
        input.references,
        input.latitude,
        input.longitude,
        input.shippingFeeCents,
      ],
    );
  }
  async transitionFindSolicitudDomicilio(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindSolicitudDomicilioRow[]> {
    return manager.query<TransitionFindSolicitudDomicilioRow[]>(
      `SELECT s.estado,s.id_jornada,s.id_configuracion,c.version FROM solicitud_domicilio s JOIN config_domicilio c ON c.id_configuracion=s.id_configuracion WHERE s.id_solicitud=$1 FOR UPDATE OF s`,
      [input.id],
    );
  }
  async transitionFindEntregaDomicilio(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindEntregaDomicilioRow[]> {
    return manager.query<TransitionFindEntregaDomicilioRow[]>(
      'SELECT 1 FROM entrega_domicilio WHERE id_solicitud=$1',
      [input.id],
    );
  }
  async transitionUpdateSolicitudDomicilio(
    manager: EntityManager,
    input: {
      id: string;
      status: 'approved' | 'rejected' | 'cancelled';
      userId: string;
      reason: string | null;
    },
  ): Promise<void> {
    await manager.query(
      `UPDATE solicitud_domicilio SET estado=$2::varchar,decidida_en=CASE WHEN $2::varchar IN ('approved','rejected') THEN clock_timestamp() ELSE decidida_en END,decidida_por=CASE WHEN $2::varchar IN ('approved','rejected') THEN $3::uuid ELSE decidida_por END,motivo_rechazo=CASE WHEN $2::varchar='rejected' THEN $4::varchar ELSE motivo_rechazo END,cancelada_en=CASE WHEN $2::varchar='cancelled' THEN clock_timestamp() ELSE cancelada_en END WHERE id_solicitud=$1`,
      [input.id, input.status, input.userId, input.reason],
    );
  }

  async listRequestIds(
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
    const where = `WHERE ($1::uuid IS NULL OR id_cliente=$1) AND ($2::text IS NULL OR estado=$2) AND ($3::uuid IS NULL OR id_jornada=$3)`;
    const [{ total }] = await this.listFindSolicitudDomicilio(
      manager,
      args,
      where,
    );
    const rows: Array<{ id: string }> =
      await this.listFindSolicitudDomicilioNext(
        manager,
        [...args, query.limit, (query.page - 1) * query.limit],
        where,
      );

    return { rows, total };
  }
}
