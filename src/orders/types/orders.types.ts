export interface EditFindPedidoRow {
  id_visita: string;
}

export interface EditFindPedidoNextRow {
  estado: string;
  id_cuenta: string;
  id_jornada: string;
  id_version: string;
  numero: number;
  editable: boolean;
}

export interface EditFindLiquidacionRow {
  '1': string;
}

export interface EditFindProductoRow {
  id: string;
  price: number;
  tracks: boolean;
}

export interface EditFindDetallePedidoRow {
  id: string;
  price: number;
  tracks: boolean;
}

export interface EditFindReservaInventarioRow {
  id: string;
  inventory: string;
  quantity: number;
}

export interface EditFindInventarioDiarioRow {
  id: string;
  product: string;
  available: number;
}

export interface EditInsertVersionPedidoRow {
  id: string;
}

export interface EditInsertDetallePedidoRow {
  id: string;
}

export interface TransitionFindUsuarioRow {
  '1': string;
}

export interface TransitionFindUsuarioNextRow {
  '1': string;
}

export interface TransitionFindPedidoNextRow {
  estado: string;
  modalidad: string;
  origen: string;
  id_jornada: string;
  id_cuenta: string;
  id_version: string;
  numero: number;
}

export interface TransitionFindCuentaConsumoRow {
  estado: string;
}

export interface TransitionFindJornadaOperativaRow {
  '1': string;
}

export interface TransitionFindLiquidacionRow {
  '1': string;
}

export interface TransitionFindPagoRow {
  '1': string;
}

export interface TransitionFindSolicitudCancelacionRow {
  '1': string;
}

export interface TransitionFindReservaInventarioRow {
  id: string;
  inventory: string;
  quantity: number;
  physical: number;
}

export interface CreateFindParticipanteRow {
  '1': string;
}

export interface CreateFindParticipanteNextRow {
  id: string;
  day: string;
}

export interface CreateFindCajaRow {
  estado: string;
}

export interface CreateFindInventarioDiarioRow {
  id: string;
  product: string;
  available: number;
}

export interface CreateInsertPedidoRow {
  id: string;
}

export interface CreateInsertVersionPedidoRow {
  id: string;
}

export interface CreateDeliveryFindSolicitudDomicilioRow {
  '1': string;
}

export interface CreateDeliveryFindJornadaOperativaRow {
  id: string;
  cash: string;
}

export interface CreateDeliveryFindSolicitudDomicilioNextRow {
  id_solicitud: string;
  id_cliente: string;
  id_jornada: string;
  id_configuracion: string;
  destinatario: string;
  telefono: string;
  direccion: string;
  referencias: string;
  latitud: number;
  longitud: number;
  tarifa_ctvs: string;
  estado: string;
  creada_en: Date;
  decidida_en: Date;
  decidida_por: string;
  motivo_rechazo: string;
  cancelada_en: Date;
  version: number;
}

export interface CreateDeliveryFindConfigDomicilioRow {
  id_configuracion: string;
  version: number;
  habilitado: boolean;
  cobertura: string;
  tarifa_ctvs: string;
  configurada_por: string;
  creada_en: Date;
  comprobante_plazo_seg: number;
}

export interface CreateDeliveryFindEntregaDomicilioRow {
  '1': string;
}

export interface CreateDeliveryInsertCuentaConsumoRow {
  id: string;
  day: string;
}

export interface CreateDeliveryInsertPedidoRow {
  id: string;
}

export interface CreateDeliveryInsertLiquidacionRow {
  id: string;
}

export interface DetailFindPedidoRow {
  id: string;
  modality: string;
  visitId: string;
  operatingDayId: string;
  accountId: string;
  status: string;
  submittedAt: Date;
  editableUntil: Date;
  canEdit: boolean;
  versionId: string;
  version: number;
  notes: string;
  totalCents: number;
  currency: string;
  delivery?: DetailFindEntregaDomicilioRow | null;
  productsCents?: number;
  shippingCents?: number;
  settlement?: DetailFindLiquidacionRow | null;
  items?: DetailFindDetallePedidoRow[];
  history?: DetailFindHistorialPedidoRow[];
}

export interface DetailFindEntregaDomicilioRow {
  receiptSubmissionDeadline: Date;
  dispatchedAt: Date;
  dispatchedBy: string;
  deliveredAt: Date;
  deliveredBy: string;
  requestId: string;
  recipientName: string;
  phone: string;
  address: string;
  references: string;
  latitude: number;
  longitude: number;
  configurationVersion: number;
  shippingCents: number;
}

export interface DetailFindLiquidacionRow {
  id: string;
  status: string;
}

export interface DetailFindDetallePedidoRow {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  tracksInventory: boolean;
  notes: string;
}

export interface DetailFindHistorialPedidoRow {
  actorType: string;
  userId: string;
  guestSessionId: string;
  event: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  occurredAt: Date;
}

export interface HistoryFindVersionPedidoRow {
  id: string;
  version: number;
  status: string;
  totalCents: number;
  notes: string;
  createdAt: Date;
  items?: HistoryFindDetallePedidoRow[];
}

export interface HistoryFindDetallePedidoRow {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  tracksInventory: boolean;
  notes: string;
}

export interface ListFindOperationRow {
  total: number;
}

export interface ListFindOperationNextRow {
  id: string;
}
