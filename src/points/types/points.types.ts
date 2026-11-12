export interface CurrentFindConfiguracionPuntosRow {
  version: number;
  enabled: boolean;
  pointsPerDollar: number;
  configuredBy: string;
  createdAt: Date;
}

export interface ConfigureFindRolPermisoRow {
  activo: boolean;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}

export interface ConfigureInsertConfiguracionPuntosRow {
  id: string;
}

export interface RecordConfirmedPaymentFindDetalleLiquidacionRow {
  id_pago: string;
  estado: string;
  id_cuenta: string;
  products: string;
  id_cliente: string;
  modalidad: string;
  registered: boolean;
}

export interface RecordConfirmedPaymentInsertAcumulacionPuntosRow {
  id: string;
}

export interface DeliverOrderUpdateAcumulacionPuntosRow {
  id_acumulacion: string;
  id_cliente: string;
  puntos: string;
  id_pago: string;
}

export interface RefundFindAcumulacionPuntosRow {
  id_acumulacion: string;
  id_cliente: string;
  puntos: string;
}

export interface BalanceFindMovimientoPuntosRow {
  balance: string;
  pending: string;
  reserved: string;
}

export interface RequireClientFindClienteRow {
  '1': string;
}

export interface MovementsFindOperationRow {
  total: number;
}

export interface MovementsFindPedidoRow {
  id: string;
  type: string;
  points: number;
  orderId: boolean;
  paymentId: string;
  redemptionId: string;
  createdAt: Date;
}
