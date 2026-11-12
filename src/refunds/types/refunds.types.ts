export interface StaffFindUsuarioRow {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
}

export interface StaffFindUsuarioNextRow {
  '1': string;
}

export interface ListFindOperationRow {
  total: number;
}

export interface RefundsFindOperationNextRow {
  id: string;
}

export interface RefundFindDevolucionRow {
  id: string;
  cancellationRequestId: string;
  orderId: string;
  paymentId: string;
  amountCents: number;
  status: string;
  createdAt: Date;
  method: string;
  executedAt: Date;
  refundedCents: number;
  currency: string;
  executedBy?: string | null;
  cashRegisterId?: string | null;
  bankOperationReference?: string | null;
  recipientName?: string | null;
  notes?: string | null;
  history?: RefundFindHistorialDevolucionRow[];
}

export interface RefundFindHistorialDevolucionRow {
  userId: string;
  event: string;
  occurredAt: Date;
  detalle: unknown;
}

export interface ExecuteRefundFindDevolucionRow {
  id: string;
  cancellationRequestId: string;
  paymentId: string;
  orderId: string;
  amount: number;
  estado: string;
  paymentStatus: string;
  paidAmount: number;
  cancellationStatus: string;
}

export interface ExecuteRefundFindConfiguracionOperativaRow {
  id: string;
  cashRegisterId: string;
  opening: string;
  dayStatus: string;
  cashStatus: string;
}

export interface ExecuteRefundFindPagoRow {
  income: string;
  refunds: string;
}

export interface ExecuteRefundUpdateDevolucionRow {
  id_devolucion: string;
}
