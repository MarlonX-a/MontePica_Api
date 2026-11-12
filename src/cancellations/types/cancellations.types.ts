export interface StaffFindUsuarioRow {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
}

export interface StaffFindUsuarioNextRow {
  '1': string;
}

export interface CreateFindPedidoRow {
  '1': string;
}

export interface CreateFindPedidoNextRow {
  estado: string;
  modalidad: string;
  id_cuenta: string;
  id_version: string;
  numero: number;
}

export interface CreateFindLiquidacionRow {
  '1': string;
}

export interface CreateFindSolicitudCancelacionRow {
  '1': string;
}

export interface CreateFindLiquidacionNextRow {
  '1': string;
}

export interface CreateInsertSolicitudCancelacionRow {
  id: string;
}

export interface DetailFindSolicitudCancelacionRow {
  id: string;
  orderId: string;
  modality: string;
  operatingDayId: string;
  versionId: string;
  orderStatus: string;
  status: string;
  reason: string;
  createdAt: Date;
  decidedAt: Date;
  rejectionReason: string;
  requestedBy?: string | null;
  decidedBy?: string | null;
  history?: DetailFindHistorialCancelacionRow[];
}

export interface DetailFindHistorialCancelacionRow {
  event: string;
  userId: string;
  guestSessionId: string;
  occurredAt: Date;
}

export interface ListFindOperationRow {
  total: number;
}

export interface ListFindOperationNextRow {
  id: string;
}

export interface DecideFindSolicitudCancelacionRow {
  id_solicitud: string;
  id_pedido: string;
  id_version: string;
  estado_pedido: string;
  solicitada_cliente: boolean;
  estado: string;
  motivo: string;
  actor_usuario: string;
  actor_sesion_cliente: string;
  creada_en: Date;
  decidida_por: string;
  decidida_en: Date;
  motivo_rechazo: string;
  id_cuenta: string;
  modalidad: string;
  current_order: string;
  account_status: string;
  id_pago: string;
  id_liquidacion: string;
  payment_status: string;
  importe_ctvs: string;
  total_ctvs: string;
}

export interface DecideFindVersionPedidoRow {
  id_version: string;
}

export interface DecideFindPagoRow {
  '1': string;
}

export interface DecideInsertDevolucionRow {
  id: string;
}
