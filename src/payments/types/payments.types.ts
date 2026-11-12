export interface AuthorizeFindUsuarioRow {
  activo: boolean;
  revocada_en: Date | null;
  valid: boolean;
}

export interface AuthorizeFindUsuarioNextRow {
  '1': string;
}

export interface CollectFindLiquidacionRow {
  id_cuenta: string;
  id_participante: string;
  modalidad: string;
  id_visita: string;
  id_caja: string;
}

export interface CollectFindCajaRow {
  estado: string;
  day_status: string;
  current: boolean;
}

export interface CollectFindParticipanteRow {
  estado: string;
}

export interface CollectFindCuentaConsumoRow {
  estado: string;
}

export interface CollectFindLiquidacionNextRow {
  estado: string;
  total: number;
}

export interface CollectFindPagoRow {
  '1': string;
}

export interface CollectInsertPagoRow {
  id: string;
}

export interface DetailFindDevolucionRow {
  id: string;
  settlementId: string;
  accountId: string;
  cashRegisterId: string;
  method: string;
  status: string;
  amountCents: number;
  paidCents: number;
  refundPendingCents: number;
  refundedCents: number;
  receivedCents: number;
  changeCents: number;
  currency: string;
  createdAt: Date;
  verifiedAt: Date;
  rejectionReason: string;
  receipt?: DetailFindComprobanteRow | null;
  registeredBy?: string | null;
  registeredByGuestSessionId?: string | null;
  verifiedBy?: string | null;
  bankOperationReference?: string | null;
  history?: DetailFindHistorialPagoRow[];
}

export interface DetailFindComprobanteRow {
  mime: string;
  size: number;
  sha256: string;
  uploadedAt: Date;
}

export interface DetailFindPagoRow {
  registeredBy: string;
  registeredByGuestSessionId: string;
  verifiedBy: string;
  bankOperationReference: string;
}

export interface DetailFindHistorialPagoRow {
  userId: string;
  guestSessionId: string;
  event: string;
  previousStatus: string;
  newStatus: string;
  occurredAt: Date;
}

export interface ListFindOperationRow {
  total: number;
}

export interface ListFindOperationNextRow {
  id: string;
}
