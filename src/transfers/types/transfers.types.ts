export interface StaffFindUsuarioRow {
  activo: boolean;
  revocada_en: Date | null;
  valid: boolean;
}

export interface StaffFindUsuarioNextRow {
  '1': string;
}

export interface UploadFindLiquidacionRow {
  '1': string;
}

export interface UploadFindLiquidacionNextRow {
  id_cuenta: string;
  id_caja: string;
  id_cliente: string;
}

export interface UploadFindCajaRow {
  estado: string;
  day_status: string;
  current: boolean;
}

export interface UploadFindCuentaConsumoRow {
  estado: string;
}

export interface UploadFindLiquidacionNextNextRow {
  estado: string;
  total: number;
}

export interface UploadFindPagoRow {
  '1': string;
}

export interface UploadFindEntregaDomicilioRow {
  '1': string;
}

export interface UploadInsertPagoRow {
  id: string;
}

export interface UploadFindComprobanteRow {
  '1': string;
}

export interface DecideFindPagoRow {
  id_liquidacion: string;
  id_cuenta: string;
  id_caja: string;
  id_participante: string;
  modalidad: string;
  id_visita: string;
}

export interface DecideFindParticipanteRow {
  estado: string;
}

export interface DecideFindLiquidacionRow {
  estado: string;
}

export interface DecideFindPagoNextRow {
  estado: string;
  metodo: string;
}

export interface DecideFindPedidoRow {
  id_pedido: string;
}

export interface DecideFindLiquidacionNextRow {
  estado: string;
}

export interface ReceiptFindComprobanteRow {
  key: string;
  mime: string;
}
