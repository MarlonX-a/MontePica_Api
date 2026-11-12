export interface AuthorizeFindUsuarioRow {
  activo: boolean;
  revocada_en: Date | null;
  valid: boolean;
}

export interface AuthorizeFindUsuarioNextRow {
  '1': string;
}

export interface AccountFindCuentaConsumoRow {
  id: string;
  modality: string;
  clientId: string;
  participantId: string;
  operatingDayId: string;
  visitId: string;
  status: string;
  createdAt: Date;
  closedAt: Date;
  items?: AccountFindAsignacionConsumoRow[];
  totalCents?: number;
  productsCents?: number;
  shippingCents?: number;
  paidCents?: number;
  pendingCents?: number;
  refundPendingCents?: number;
  refundedCents?: number;
  currency?: string;
  pendingSettlement?: AccountFindLiquidacionNextRow | null;
}

export interface AccountFindAsignacionConsumoRow {
  id: string;
  orderId: string;
  orderStatus: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface AccountFindDetalleLiquidacionRow {
  paid: number;
  resolved: number;
}

export interface AccountFindLiquidacionRow {
  fee: number;
  paid: number;
}

export interface AccountFindDevolucionRow {
  pending: number;
  completed: number;
}

export interface AccountFindLiquidacionNextRow {
  id: string;
  status: string;
  totalCents: number;
}

export interface SettlementFindPagoRow {
  id: string;
  accountId: string;
  cashRegisterId: string;
  status: string;
  productsCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  createdBy: string;
  createdAt: Date;
  cancelledBy: string;
  cancelledAt: Date;
  cancellationReason: string;
  settledAt: Date;
  resolution: string;
  paymentId: string | null;
  items?: SettlementFindDetalleLiquidacionRow[];
}

export interface SettlementFindDetalleLiquidacionRow {
  id: string;
  assignmentId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  active: boolean;
}

export interface AccountsFindOperationRow {
  total: number;
}

export interface AccountsFindOperationNextRow {
  id: string;
}

export interface SettlementsFindLiquidacionRow {
  total: number;
}

export interface SettlementsFindLiquidacionNextRow {
  id: string;
}

export interface CreateFindJornadaOperativaRow {
  id: string;
  cash: string;
}

export interface CreateFindCuentaConsumoRow {
  estado: string;
  modalidad: string;
}

export interface CreateFindLiquidacionRow {
  '1': string;
}

export interface CreateFindSolicitudCancelacionRow {
  '1': string;
}

export interface CreateFindPedidoRow {
  '1': string;
}

export interface CreateFindAsignacionConsumoRow {
  id: string;
  quantity: number;
  price: number;
}

export interface CreateInsertLiquidacionRow {
  id: string;
}

export interface CancelFindLiquidacionRow {
  id_cuenta: string;
}

export interface CancelFindCuentaConsumoRow {
  modalidad: string;
}

export interface CancelFindLiquidacionNextRow {
  estado: string;
}

export interface CancelFindPagoRow {
  '1': string;
}
