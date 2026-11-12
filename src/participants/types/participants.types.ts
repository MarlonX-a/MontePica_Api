export const participantColumns = `p."id_participante" AS id,p."id_visita" AS "visitId",p."id_cliente" AS "clientId",
 p."alias",p."estado" AS status,p."qr_version_aprobada" AS "requestedQrVersion",p."solicitada_en" AS "requestedAt",
 p."aprobada_en" AS "approvedAt",p."finalizada_en" AS "finishedAt",p."motivo_rechazo" AS "rejectionReason",
 CASE WHEN c."id_cuenta" IS NULL THEN NULL ELSE json_build_object('id',c."id_cuenta",'status',c."estado",'modality',c."modalidad",'createdAt',c."creada_en",'closedAt',c."cerrada_en") END AS account`;

export interface AuthenticateFindSesionClienteRow {
  '1': string;
}

export interface AuthenticateFindClienteRow {
  '1': string;
}

export interface AuthenticateFindParticipanteRow {
  '1': string;
}

export interface RequestFindParticipanteRow {
  '1': string;
}

export interface RequestInsertParticipanteRow {
  id: string;
}

export interface GetParticipantFindParticipanteRow {
  id: string;
  visitId: string;
  clientId: string;
  alias: string;
  status: string;
  requestedQrVersion: number;
  requestedAt: Date;
  approvedAt: Date;
  finishedAt: Date;
  rejectionReason: string;
  account: { id: string; status: string } | null;
}

export interface ParticipantsFindVisitaMesaRow {
  '1': string;
}

export interface ParticipantsFindParticipanteRow {
  total: number;
}

export interface ParticipantsFindParticipanteNextRow {
  id: string;
  visitId: string;
  clientId: string;
  alias: string;
  status: string;
  requestedQrVersion: number;
  requestedAt: Date;
  approvedAt: Date;
  finishedAt: Date;
  rejectionReason: string;
  account: { id: string; status: string } | null;
}

export interface VisitsFindVisitaMesaRow {
  total: number;
}

export interface VisitsFindVisitaMesaNextRow {
  id: string;
  tableId: string;
  operatingDayId: string;
  status: string;
  openedAt: Date;
  closedAt: Date;
  openedBy: string;
  closedBy: string;
}

export interface VisitFindVisitaMesaRow {
  id: string;
  tableId: string;
  operatingDayId: string;
  status: string;
  openedAt: Date;
  closedAt: Date;
  openedBy: string;
  closedBy: string;
}

export interface TransitionFindParticipanteRow {
  visitId: string;
  clientId: string;
}

export interface TransitionFindParticipanteNextRow {
  id_participante: string;
  id_visita: string;
  id_cliente: string;
  sesion_origen_id: string;
  solicitada_desde: string;
  aprobada_por: string;
  alias: string;
  estado: string;
  qr_version_aprobada: number;
  solicitada_en: Date;
  aprobada_en: Date;
  finalizada_en: Date;
  motivo_rechazo: string;
}

export interface TransitionFindVisitaMesaRow {
  dayId: string;
  version: number;
}

export interface TransitionFindSesionClienteRow {
  '1': string;
}

export interface TransitionFindParticipanteNextNextRow {
  '1': string;
}

export interface LockVisitFindVisitaMesaRow {
  id_jornada: string;
  id_mesa: string;
}

export interface LockVisitFindVisitaMesaNextRow {
  estado: string;
}

export interface CloseFindParticipanteRow {
  id: string;
  status: string;
}

export interface CloseUpdateVisitaMesaRow {
  id: string;
  status: string;
  closedAt: Date;
}

export interface CloseOperatingDayFindVisitaMesaRow {
  id: string;
  tableId: string;
}

export interface AssertAccountsEmptyFindParticipanteRow {
  '1': string;
}
