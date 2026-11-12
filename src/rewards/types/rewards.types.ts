export const redemptionFields = `s.id_canje AS id,s.id_cliente AS "clientId",s.id_participante AS "participantId",s.id_cuenta AS "accountId",s.id_visita AS "visitId",s.id_jornada AS "operatingDayId",s.id_recompensa AS "rewardId",s.version_recompensa AS "rewardVersion",s.id_producto AS "productId",s.costo_puntos::float8 AS "pointsCost",s.estado AS status,s.expira_en AS "expiresAt",s.creada_en AS "createdAt",s.resuelta_en AS "resolvedAt",s.id_pedido AS "orderId",s.motivo AS reason`;

export const rewardFields = `r.id_recompensa AS id,r.nombre AS name,r.descripcion AS description,r.id_producto AS "productId",r.costo_puntos::float8 AS "pointsCost",r.activa AS active,r.orden AS "sortOrder",r.version AS version,r.creada_en AS "createdAt",r.actualizada_en AS "updatedAt",p.nombre AS "productName",p.precio_ctvs AS "productPriceCents",p.controla_inventario AS "tracksInventory"`;

export interface StaffFindRolPermisoRow {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}

export interface ClientFindClienteRow {
  '1': string;
}

export interface CreateRewardFindProductoRow {
  id_producto: string;
}

export interface CreateRewardInsertRecompensaRow {
  id: string;
}

export interface UpdateRewardFindRecompensaRow {
  id_recompensa: string;
  nombre: string;
  descripcion: string;
  id_producto: string;
  costo_puntos: string;
  activa: boolean;
  orden: number;
  version: number;
  creada_en: Date;
  actualizada_en: Date;
}

export interface UpdateRewardUpdateRecompensaRow {
  id: string;
}

export interface RewardFindRecompensaRow {
  id: string;
  name: string;
  description: string;
  productId: string;
  pointsCost: number;
  active: boolean;
  sortOrder: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  productName: string;
  productPriceCents: number;
  tracksInventory: boolean;
  product_active?: boolean;
  product_visible?: boolean;
  category_active?: boolean;
}

export interface ListRewardsFindOperationRow {
  total: number;
}

export interface ListRewardsFindOperationNextRow {
  id: string;
  name: string;
  description: string;
  productId: string;
  pointsCost: number;
  active: boolean;
  sortOrder: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  productName: string;
  productPriceCents: number;
  tracksInventory: boolean;
}

export interface RequestFindParticipanteRow {
  '1': string;
}

export interface RequestFindParticipanteNextRow {
  id: string;
  client: string;
  status: string;
  account: string;
  dayId: string;
  account_status: string;
}

export interface RequestFindCajaRow {
  estado: string;
}

export interface RequestFindLiquidacionRow {
  '1': string;
}

export interface RequestFindRecompensaRow {
  id_recompensa: string;
  nombre: string;
  descripcion: string;
  id_producto: string;
  costo_puntos: string;
  activa: boolean;
  orden: number;
  version: number;
  creada_en: Date;
  actualizada_en: Date;
  tracks: boolean;
}

export interface RequestFindMovimientoPuntosRow {
  balance: string;
}

export interface RequestFindReservaPuntosCanjeRow {
  total: string;
}

export interface RequestFindInventarioDiarioRow {
  id: string;
  available: number;
}

export interface RequestInsertSolicitudCanjeRow {
  id: string;
  expiresAt: Date;
}

export interface RedemptionFindSolicitudCanjeRow {
  id: string;
  clientId: string;
  participantId: string;
  accountId: string;
  visitId: string;
  operatingDayId: string;
  rewardId: string;
  rewardVersion: number;
  productId: string;
  pointsCost: number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  resolvedAt: Date;
  orderId: string;
  reason: string;
  rewardName: string;
  productName: string;
  history?: RedemptionFindHistorialCanjeRow[];
}

export interface RedemptionFindHistorialCanjeRow {
  event: string;
  actorUserId: string;
  detail: unknown;
  occurredAt: Date;
}

export interface ListRedemptionsFindOperationNextRow {
  id: string;
}

export interface CancelFindSolicitudCanjeRow {
  '1': string;
}

export interface CancelFindSolicitudCanjeNextRow {
  id_canje: string;
  id_cliente: string;
  id_participante: string;
  id_cuenta: string;
  id_visita: string;
  id_jornada: string;
  id_recompensa: string;
  version_recompensa: number;
  id_producto: string;
  controla_stock: boolean;
  costo_puntos: string;
  estado: string;
  expira_en: Date;
  creada_en: Date;
  resuelta_en: Date;
  creado_por: string;
  resuelto_por: string;
  id_pedido: string;
  motivo: string;
}

export interface DecideFindSolicitudCanjeRow {
  visit: string;
  client: string;
  account: string;
}

export interface DecideFindSolicitudCanjeNextRow {
  '1': string;
}

export interface DecideFindSolicitudCanjeNextNextRow {
  id_canje: string;
  id_cliente: string;
  id_participante: string;
  id_cuenta: string;
  id_visita: string;
  id_jornada: string;
  id_recompensa: string;
  version_recompensa: number;
  id_producto: string;
  controla_stock: boolean;
  costo_puntos: string;
  estado: string;
  expira_en: Date;
  creada_en: Date;
  resuelta_en: Date;
  creado_por: string;
  resuelto_por: string;
  id_pedido: string;
  motivo: string;
}

export interface DecideFindSolicitudCanjeNextNextNextRow {
  fresh: boolean;
  participant: string;
  account: string;
  visit: string;
  table_active: boolean;
  day_status: string;
  zone: string;
  current_day: boolean;
  reward: boolean;
  product_active: boolean;
  visible_menu: boolean;
  category_active: boolean;
  tracks: boolean;
}

export interface DecideFindMovimientoPuntosRow {
  balance: string;
  reserved: string;
}

export interface DecideFindReservaInventarioCanjeRow {
  reservation: string;
  inventory: string;
  reservation_state: string;
  physical: number;
  reserved: number;
}

export interface DecideInsertPedidoRow {
  id: string;
}

export interface DecideInsertVersionPedidoRow {
  id: string;
}

export interface DecideInsertDetallePedidoRow {
  id: string;
}

export interface ReleaseFindReservaInventarioCanjeRow {
  inventory: string;
}

export interface ReleaseForParticipantFindSolicitudCanjeRow {
  id: string;
}

export interface ReleaseForVisitFindSolicitudCanjeRow {
  id: string;
}

export interface ReleaseForOperatingDayFindSolicitudCanjeRow {
  id: string;
}

export interface RefundForOrderFindSolicitudCanjeRow {
  id: string;
  client: string;
  points: string;
  estado: string;
}

export interface RefundForOrderInsertMovimientoPuntosRow {
  id_movimiento: string;
}

export interface EnsurePointBalanceFindMovimientoPuntosRow {
  balance: string;
}

export interface ExpirePendingFindSolicitudCanjeRow {
  id: string;
}

export interface ExpirePendingFindSolicitudCanjeNextRow {
  id_canje: string;
}
