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
