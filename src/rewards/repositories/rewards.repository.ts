import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';
const redemptionFields = `s.id_canje AS id,s.id_cliente AS "clientId",s.id_participante AS "participantId",s.id_cuenta AS "accountId",s.id_visita AS "visitId",s.id_jornada AS "operatingDayId",s.id_recompensa AS "rewardId",s.version_recompensa AS "rewardVersion",s.id_producto AS "productId",s.costo_puntos::float8 AS "pointsCost",s.estado AS status,s.expira_en AS "expiresAt",s.creada_en AS "createdAt",s.resuelta_en AS "resolvedAt",s.id_pedido AS "orderId",s.motivo AS reason`;
const rewardFields = `r.id_recompensa AS id,r.nombre AS name,r.descripcion AS description,r.id_producto AS "productId",r.costo_puntos::float8 AS "pointsCost",r.activa AS active,r.orden AS "sortOrder",r.version AS version,r.creada_en AS "createdAt",r.actualizada_en AS "updatedAt",p.nombre AS "productName",p.precio_ctvs AS "productPriceCents",p.controla_inventario AS "tracksInventory"`;
import type {
  AdminRedemptionListDto,
  RedemptionListDto,
  RewardListDto,
} from '../rewards.dto.js';
// Read builders

// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
import type { EntityManager } from 'typeorm';
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
export class RewardsRepository {
  async staffFindRolPermiso(
    manager: EntityManager,
    input: { userId: string; sessionId: string; permission: string },
  ): Promise<StaffFindRolPermisoRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      input.permission,
    );
    return row ? [row] : [];
  }
  async clientFindCliente(
    manager: EntityManager,
    input: {
      clientId: string;
      userId: string;
      userSessionId: string | undefined;
    },
  ): Promise<ClientFindClienteRow[]> {
    return manager.query<ClientFindClienteRow[]>(
      `SELECT 1 FROM cliente c JOIN usuario u ON u.id_usuario=c.id_usuario JOIN rol r ON r.id_rol=u.id_rol JOIN sesion_usuario se ON se.id_usuario=u.id_usuario WHERE c.id_cliente=$1 AND u.id_usuario=$2 AND u.activo AND r.codigo='client' AND se.id_sesion_usuario=$3 AND se.revocada_en IS NULL AND se.expira_en>clock_timestamp() FOR SHARE OF u,se`,
      [input.clientId, input.userId, input.userSessionId],
    );
  }
  async createRewardFindProducto(
    manager: EntityManager,
    input: { productId: string },
  ): Promise<CreateRewardFindProductoRow[]> {
    return manager.query<CreateRewardFindProductoRow[]>(
      'SELECT id_producto FROM producto WHERE id_producto=$1 FOR SHARE',
      [input.productId],
    );
  }
  async createRewardInsertRecompensa(
    manager: EntityManager,
    input: {
      name: string;
      description: string | null;
      productId: string;
      pointsCost: number;
      active: boolean;
      sortOrder: number;
    },
  ): Promise<CreateRewardInsertRecompensaRow[]> {
    return manager.query<CreateRewardInsertRecompensaRow[]>(
      `INSERT INTO recompensa(nombre,descripcion,id_producto,costo_puntos,activa,orden) VALUES($1,$2,$3,$4,$5,$6) RETURNING id_recompensa id`,
      [
        input.name,
        input.description,
        input.productId,
        input.pointsCost,
        input.active,
        input.sortOrder,
      ],
    );
  }
  async updateRewardFindRecompensa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UpdateRewardFindRecompensaRow[]> {
    return manager.query<UpdateRewardFindRecompensaRow[]>(
      'SELECT * FROM recompensa WHERE id_recompensa=$1 FOR UPDATE',
      [input.id],
    );
  }
  async updateRewardUpdateRecompensa(
    manager: EntityManager,
    input: {
      id: string;
      name: string | undefined;
      description: boolean;
      description4: string | null;
      pointsCost: number | undefined;
      active: boolean | undefined;
      sortOrder: number | undefined;
    },
  ): Promise<UpdateRewardUpdateRecompensaRow[]> {
    const [rows] = await manager.query<
      [UpdateRewardUpdateRecompensaRow[], number]
    >(
      `UPDATE recompensa SET nombre=COALESCE($2,nombre),descripcion=CASE WHEN $3 THEN $4 ELSE descripcion END,costo_puntos=COALESCE($5,costo_puntos),activa=COALESCE($6,activa),orden=COALESCE($7,orden),version=version+1,actualizada_en=clock_timestamp() WHERE id_recompensa=$1 RETURNING id_recompensa id`,
      [
        input.id,
        input.name,
        input.description,
        input.description4,
        input.pointsCost,
        input.active,
        input.sortOrder,
      ],
    );
    return rows;
  }
  async rewardFindRecompensa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RewardFindRecompensaRow[]> {
    return manager.query<RewardFindRecompensaRow[]>(
      `SELECT ${rewardFields},p.activo product_active,p.visible_menu product_visible,c.activa category_active FROM recompensa r JOIN producto p ON p.id_producto=r.id_producto LEFT JOIN categoria c ON c.id_categoria=p.id_categoria WHERE r.id_recompensa=$1`,
      [input.id],
    );
  }
  private async listRewardsFindOperation(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
  ): Promise<ListRewardsFindOperationRow[]> {
    return manager.query<ListRewardsFindOperationRow[]>(
      `SELECT count(*)::int total ${fragment0} WHERE ${fragment1}`,
      parameters,
    );
  }
  private async listRewardsFindOperationNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
    fragment2: unknown,
  ): Promise<ListRewardsFindOperationNextRow[]> {
    return manager.query<ListRewardsFindOperationNextRow[]>(
      `SELECT ${fragment0} ${fragment1} WHERE ${fragment2} ORDER BY r.orden,r.nombre,r.id_recompensa LIMIT $5 OFFSET $6`,
      parameters,
    );
  }
  async requestFindParticipante(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<RequestFindParticipanteRow[]> {
    return manager.query<RequestFindParticipanteRow[]>(
      'SELECT 1 FROM participante WHERE id_visita=$1 AND id_cliente=$2',
      [input.visitId, input.clientId],
    );
  }
  async requestFindParticipanteNext(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<RequestFindParticipanteNextRow[]> {
    return manager.query<RequestFindParticipanteNextRow[]>(
      `SELECT p.id_participante id,p.id_cliente client,p.estado status,c.id_cuenta account,c.id_jornada "dayId",c.estado account_status FROM participante p JOIN cuenta_consumo c ON c.id_participante=p.id_participante WHERE p.id_visita=$1 AND p.id_cliente=$2 FOR UPDATE OF p,c`,
      [input.visitId, input.clientId],
    );
  }
  async requestFindCaja(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<RequestFindCajaRow[]> {
    return manager.query<RequestFindCajaRow[]>(
      'SELECT estado FROM caja WHERE id_jornada=$1',
      [input.dayId],
    );
  }
  async requestFindLiquidacion(
    manager: EntityManager,
    input: { account: string },
  ): Promise<RequestFindLiquidacionRow[]> {
    return manager.query<RequestFindLiquidacionRow[]>(
      `SELECT 1 FROM liquidacion WHERE id_cuenta=$1 AND estado='pending'`,
      [input.account],
    );
  }
  async requestFindRecompensa(
    manager: EntityManager,
    input: { rewardId: string },
  ): Promise<RequestFindRecompensaRow[]> {
    return manager.query<RequestFindRecompensaRow[]>(
      `SELECT r.*,p.controla_inventario tracks FROM recompensa r JOIN producto p ON p.id_producto=r.id_producto JOIN categoria c ON c.id_categoria=p.id_categoria WHERE r.id_recompensa=$1 AND r.activa AND p.activo AND p.visible_menu AND c.activa FOR SHARE OF r,p,c`,
      [input.rewardId],
    );
  }
  async requestFindCliente(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<void> {
    await manager.query(
      'SELECT 1 FROM cliente WHERE id_cliente=$1 FOR UPDATE',
      [input.clientId],
    );
  }
  async requestFindMovimientoPuntos(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<RequestFindMovimientoPuntosRow[]> {
    return manager.query<RequestFindMovimientoPuntosRow[]>(
      `SELECT COALESCE(sum(puntos),0)::text balance FROM movimiento_puntos WHERE id_cliente=$1`,
      [input.clientId],
    );
  }
  async requestFindReservaPuntosCanje(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<RequestFindReservaPuntosCanjeRow[]> {
    return manager.query<RequestFindReservaPuntosCanjeRow[]>(
      `SELECT COALESCE(sum(puntos),0)::text total FROM reserva_puntos_canje WHERE id_cliente=$1 AND estado='active'`,
      [input.clientId],
    );
  }
  async requestFindInventarioDiario(
    manager: EntityManager,
    input: { dayId: string; id_producto: string },
  ): Promise<RequestFindInventarioDiarioRow[]> {
    return manager.query<RequestFindInventarioDiarioRow[]>(
      `SELECT id_inventario id,cantidad_fisica-cantidad_reservada available FROM inventario_diario WHERE id_jornada=$1 AND id_producto=$2 FOR UPDATE`,
      [input.dayId, input.id_producto],
    );
  }
  async requestInsertSolicitudCanje(
    manager: EntityManager,
    input: {
      clientId: string;
      id: string;
      account: string;
      visitId: string;
      dayId: string;
      rewardId: string;
      version: number;
      id_producto: string;
      tracks: boolean;
      costo_puntos: string;
      userId: string | undefined;
    },
  ): Promise<RequestInsertSolicitudCanjeRow[]> {
    return manager.query<RequestInsertSolicitudCanjeRow[]>(
      `INSERT INTO solicitud_canje(id_cliente,id_participante,id_cuenta,id_visita,id_jornada,id_recompensa,version_recompensa,id_producto,controla_stock,costo_puntos,expira_en,creado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()+interval '15 minutes',$11) RETURNING id_canje id,expira_en "expiresAt"`,
      [
        input.clientId,
        input.id,
        input.account,
        input.visitId,
        input.dayId,
        input.rewardId,
        input.version,
        input.id_producto,
        input.tracks,
        input.costo_puntos,
        input.userId,
      ],
    );
  }
  async requestInsertReservaPuntosCanje(
    manager: EntityManager,
    input: { id: string; clientId: string; costo_puntos: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO reserva_puntos_canje(id_canje,id_cliente,puntos) VALUES($1,$2,$3)`,
      [input.id, input.clientId, input.costo_puntos],
    );
  }
  async requestUpdateInventarioDiario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      'UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada+1 WHERE id_inventario=$1',
      [input.id],
    );
  }
  async requestInsertReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string; id2: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO reserva_inventario_canje(id_canje,id_inventario) VALUES($1,$2)`,
      [input.id, input.id2],
    );
  }
  async historyInsertHistorialCanje(
    manager: EntityManager,
    input: { id: string; user: string | null; event: string; detail: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_canje(id_canje,actor_usuario,evento,detalle) VALUES($1,$2,$3,$4::jsonb)`,
      [input.id, input.user, input.event, input.detail],
    );
  }
  async redemptionFindSolicitudCanje(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<RedemptionFindSolicitudCanjeRow[]> {
    return manager.query<RedemptionFindSolicitudCanjeRow[]>(
      `SELECT ${redemptionFields},r.nombre "rewardName",p.nombre "productName" FROM solicitud_canje s JOIN recompensa r ON r.id_recompensa=s.id_recompensa JOIN producto p ON p.id_producto=s.id_producto WHERE s.id_canje=$1 AND ($2::uuid IS NULL OR s.id_cliente=$2)`,
      [input.id, input.clientId],
    );
  }
  async redemptionFindHistorialCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RedemptionFindHistorialCanjeRow[]> {
    return manager.query<RedemptionFindHistorialCanjeRow[]>(
      `SELECT evento event,actor_usuario "actorUserId",detalle AS detail,ocurrido_en "occurredAt" FROM historial_canje WHERE id_canje=$1 ORDER BY ocurrido_en,id_historial`,
      [input.id],
    );
  }
  private async listRedemptionsFindOperationNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
  ): Promise<ListRedemptionsFindOperationNextRow[]> {
    return manager.query<ListRedemptionsFindOperationNextRow[]>(
      `SELECT s.id_canje id ${fragment0} WHERE ${fragment1} ORDER BY s.creada_en DESC,s.id_canje DESC LIMIT $6 OFFSET $7`,
      parameters,
    );
  }
  async cancelFindSolicitudCanje(
    manager: EntityManager,
    input: { id: string; clientId: string },
  ): Promise<CancelFindSolicitudCanjeRow[]> {
    return manager.query<CancelFindSolicitudCanjeRow[]>(
      'SELECT 1 FROM solicitud_canje WHERE id_canje=$1 AND id_cliente=$2',
      [input.id, input.clientId],
    );
  }
  async cancelFindSolicitudCanjeNext(
    manager: EntityManager,
    input: { id: string; clientId: string },
  ): Promise<CancelFindSolicitudCanjeNextRow[]> {
    return manager.query<CancelFindSolicitudCanjeNextRow[]>(
      'SELECT * FROM solicitud_canje WHERE id_canje=$1 AND id_cliente=$2 FOR UPDATE',
      [input.id, input.clientId],
    );
  }
  async cancelUpdateSolicitudCanje(
    manager: EntityManager,
    input: { id: string; userId: string | undefined },
  ): Promise<void> {
    await manager.query(
      'UPDATE solicitud_canje SET resuelto_por=$2 WHERE id_canje=$1',
      [input.id, input.userId],
    );
  }
  async decideFindSolicitudCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCanjeRow[]> {
    return manager.query<DecideFindSolicitudCanjeRow[]>(
      'SELECT id_visita visit,id_cliente client,id_cuenta account FROM solicitud_canje WHERE id_canje=$1',
      [input.id],
    );
  }
  async decideFindVisitaMesa(
    manager: EntityManager,
    input: { visit: string },
  ): Promise<void> {
    await manager.query(
      'SELECT 1 FROM visita_mesa WHERE id_visita=$1 FOR UPDATE',
      [input.visit],
    );
  }
  async decideFindSolicitudCanjeNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCanjeNextRow[]> {
    return manager.query<DecideFindSolicitudCanjeNextRow[]>(
      `SELECT 1 FROM solicitud_canje s JOIN caja c ON c.id_jornada=s.id_jornada WHERE s.id_canje=$1 AND c.estado='closed'`,
      [input.id],
    );
  }
  async decideFindCuentaConsumo(
    manager: EntityManager,
    input: { account: string },
  ): Promise<void> {
    await manager.query(
      'SELECT 1 FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',
      [input.account],
    );
  }
  async decideFindSolicitudCanjeNextNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCanjeNextNextRow[]> {
    return manager.query<DecideFindSolicitudCanjeNextNextRow[]>(
      'SELECT * FROM solicitud_canje WHERE id_canje=$1 FOR UPDATE',
      [input.id],
    );
  }
  async decideUpdateSolicitudCanje(
    manager: EntityManager,
    input: { id: string; reason: string | undefined; userId: string },
  ): Promise<void> {
    await manager.query(
      'UPDATE solicitud_canje SET motivo=$2,resuelto_por=$3 WHERE id_canje=$1',
      [input.id, input.reason, input.userId],
    );
  }
  async decideFindSolicitudCanjeNextNextNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindSolicitudCanjeNextNextNextRow[]> {
    return manager.query<DecideFindSolicitudCanjeNextNextNextRow[]>(
      `SELECT s.expira_en>clock_timestamp() fresh,p.estado participant,c.estado account,v.estado visit,t.activa table_active,j.estado day_status,cfg.zona_horaria zone,j.fecha_operativa=timezone(cfg.zona_horaria,clock_timestamp())::date current_day,r.activa reward,pd.activo product_active,pd.visible_menu,cg.activa category_active,s.controla_stock tracks FROM solicitud_canje s JOIN participante p ON p.id_participante=s.id_participante JOIN cuenta_consumo c ON c.id_cuenta=s.id_cuenta JOIN visita_mesa v ON v.id_visita=s.id_visita JOIN mesa t ON t.id_mesa=v.id_mesa JOIN jornada_operativa j ON j.id_jornada=s.id_jornada JOIN configuracion_operativa cfg ON cfg.id_configuracion=1 JOIN recompensa r ON r.id_recompensa=s.id_recompensa JOIN producto pd ON pd.id_producto=s.id_producto JOIN categoria cg ON cg.id_categoria=pd.id_categoria WHERE s.id_canje=$1`,
      [input.id],
    );
  }
  async decideFindMovimientoPuntos(
    manager: EntityManager,
    input: { id_cliente: string; id: string },
  ): Promise<DecideFindMovimientoPuntosRow[]> {
    return manager.query<DecideFindMovimientoPuntosRow[]>(
      `SELECT COALESCE((SELECT sum(puntos) FROM movimiento_puntos WHERE id_cliente=$1),0)::text balance,COALESCE((SELECT sum(puntos) FROM reserva_puntos_canje WHERE id_cliente=$1 AND estado='active' AND id_canje<>$2),0)::text reserved`,
      [input.id_cliente, input.id],
    );
  }
  async decideFindReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindReservaInventarioCanjeRow[]> {
    return manager.query<DecideFindReservaInventarioCanjeRow[]>(
      `SELECT ric.id_reserva reservation,ric.id_inventario inventory,ric.estado reservation_state,i.cantidad_fisica physical,i.cantidad_reservada reserved FROM reserva_inventario_canje ric JOIN inventario_diario i ON i.id_inventario=ric.id_inventario WHERE ric.id_canje=$1 FOR UPDATE OF ric,i`,
      [input.id],
    );
  }
  async decideInsertPedido(
    manager: EntityManager,
    input: {
      id_jornada: string;
      id_visita: string;
      id_cuenta: string;
      userId: string;
      id: string;
    },
  ): Promise<DecideInsertPedidoRow[]> {
    return manager.query<DecideInsertPedidoRow[]>(
      `INSERT INTO pedido(id_jornada,id_visita,id_cuenta,actor_usuario,modalidad,origen,estado,id_canje) VALUES($1,$2,$3,$4,'local','reward','submitted',$5) RETURNING id_pedido id`,
      [
        input.id_jornada,
        input.id_visita,
        input.id_cuenta,
        input.userId,
        input.id,
      ],
    );
  }
  async decideInsertVersionPedido(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideInsertVersionPedidoRow[]> {
    return manager.query<DecideInsertVersionPedidoRow[]>(
      `INSERT INTO version_pedido(id_pedido,numero,estado,total_productos_ctvs) VALUES($1,1,'current',0) RETURNING id_version id`,
      [input.id],
    );
  }
  async decideInsertDetallePedido(
    manager: EntityManager,
    input: { id: string; id_producto: string; tracks: boolean },
  ): Promise<DecideInsertDetallePedidoRow[]> {
    return manager.query<DecideInsertDetallePedidoRow[]>(
      `INSERT INTO detalle_pedido(id_version,id_producto,cantidad,precio_unitario_ctvs,controla_stock_snapshot) VALUES($1,$2,1,0,$3) RETURNING id_detalle id`,
      [input.id, input.id_producto, input.tracks],
    );
  }
  async decideInsertAsignacionConsumo(
    manager: EntityManager,
    input: { id: string; id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO asignacion_consumo(id_detalle,id_cuenta,cantidad) VALUES($1,$2,1)`,
      [input.id, input.id_cuenta],
    );
  }
  async decideInsertReservaInventario(
    manager: EntityManager,
    input: { id: string; inventory: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO reserva_inventario(id_detalle,id_inventario,cantidad) VALUES($1,$2,1)`,
      [input.id, input.inventory],
    );
  }
  async decideUpdateReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE reserva_inventario_canje SET estado='transferred',resuelta_en=clock_timestamp() WHERE id_canje=$1`,
      [input.id],
    );
  }
  async decideInsertMovimientoPuntos(
    manager: EntityManager,
    input: { id_cliente: string; id: string; costo_puntos: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO movimiento_puntos(id_cliente,id_canje,tipo,puntos) VALUES($1,$2,'redeem',-$3::bigint)`,
      [input.id_cliente, input.id, input.costo_puntos],
    );
  }
  async decideUpdateReservaPuntosCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE reserva_puntos_canje SET estado='consumed',resuelta_en=clock_timestamp() WHERE id_canje=$1 AND estado='active'`,
      [input.id],
    );
  }
  async decideInsertHistorialPedido(
    manager: EntityManager,
    input: { id: string; id2: string; userId: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_tipo,evento,estado_nuevo) VALUES($1,$2,$3,'usuario','order.reward_submitted','submitted')`,
      [input.id, input.id2, input.userId],
    );
  }
  async decideUpdateSolicitudCanjeNext(
    manager: EntityManager,
    input: { id: string; id2: string; userId: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE solicitud_canje SET estado='approved',id_pedido=$2,resuelto_por=$3,resuelta_en=clock_timestamp() WHERE id_canje=$1`,
      [input.id, input.id2, input.userId],
    );
  }
  async releaseFindReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<ReleaseFindReservaInventarioCanjeRow[]> {
    return manager.query<ReleaseFindReservaInventarioCanjeRow[]>(
      `SELECT id_inventario inventory FROM reserva_inventario_canje WHERE id_canje=$1 AND estado='active' FOR UPDATE`,
      [input.id],
    );
  }
  async releaseUpdateInventarioDiario(
    manager: EntityManager,
    input: { inventory: string },
  ): Promise<void> {
    await manager.query(
      'UPDATE inventario_diario SET cantidad_reservada=cantidad_reservada-1 WHERE id_inventario=$1',
      [input.inventory],
    );
  }
  async releaseUpdateReservaInventarioCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE reserva_inventario_canje SET estado='released',resuelta_en=clock_timestamp() WHERE id_canje=$1`,
      [input.id],
    );
  }
  async releaseUpdateReservaPuntosCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE reserva_puntos_canje SET estado='released',resuelta_en=clock_timestamp() WHERE id_canje=$1 AND estado='active'`,
      [input.id],
    );
  }
  async releaseUpdateSolicitudCanje(
    manager: EntityManager,
    input: { id: string; status: 'rejected' | 'cancelled' | 'expired' },
  ): Promise<void> {
    await manager.query(
      `UPDATE solicitud_canje SET estado=$2,resuelto_por=NULL,resuelta_en=clock_timestamp() WHERE id_canje=$1`,
      [input.id, input.status],
    );
  }
  async releaseForParticipantFindSolicitudCanje(
    manager: EntityManager,
    input: { participantId: string },
  ): Promise<ReleaseForParticipantFindSolicitudCanjeRow[]> {
    return manager.query<ReleaseForParticipantFindSolicitudCanjeRow[]>(
      `SELECT id_canje id FROM solicitud_canje WHERE id_participante=$1 AND estado='pending' ORDER BY id_canje FOR UPDATE`,
      [input.participantId],
    );
  }
  async releaseForVisitFindSolicitudCanje(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<ReleaseForVisitFindSolicitudCanjeRow[]> {
    return manager.query<ReleaseForVisitFindSolicitudCanjeRow[]>(
      `SELECT id_canje id FROM solicitud_canje WHERE id_visita=$1 AND estado='pending' ORDER BY id_cliente,id_canje FOR UPDATE`,
      [input.visitId],
    );
  }
  async releaseForOperatingDayFindSolicitudCanje(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<ReleaseForOperatingDayFindSolicitudCanjeRow[]> {
    return manager.query<ReleaseForOperatingDayFindSolicitudCanjeRow[]>(
      `SELECT id_canje id FROM solicitud_canje WHERE id_jornada=$1 AND estado='pending' ORDER BY id_cliente,id_canje FOR UPDATE`,
      [input.dayId],
    );
  }
  async refundForOrderFindSolicitudCanje(
    manager: EntityManager,
    input: { orderId: string },
  ): Promise<RefundForOrderFindSolicitudCanjeRow[]> {
    return manager.query<RefundForOrderFindSolicitudCanjeRow[]>(
      `SELECT id_canje id,id_cliente client,costo_puntos points,estado FROM solicitud_canje WHERE id_pedido=$1 FOR UPDATE`,
      [input.orderId],
    );
  }
  async refundForOrderInsertMovimientoPuntos(
    manager: EntityManager,
    input: { client: string; id: string; points: string },
  ): Promise<RefundForOrderInsertMovimientoPuntosRow[]> {
    return manager.query<RefundForOrderInsertMovimientoPuntosRow[]>(
      `INSERT INTO movimiento_puntos(id_cliente,id_canje,tipo,puntos) VALUES($1,$2,'redemptionReturn',$3) ON CONFLICT(id_canje,tipo) WHERE id_canje IS NOT NULL DO NOTHING RETURNING id_movimiento`,
      [input.client, input.id, input.points],
    );
  }
  async ensurePointBalanceFindMovimientoPuntos(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<EnsurePointBalanceFindMovimientoPuntosRow[]> {
    return manager.query<EnsurePointBalanceFindMovimientoPuntosRow[]>(
      'SELECT COALESCE(sum(puntos),0)::text balance FROM movimiento_puntos WHERE id_cliente=$1',
      [input.clientId],
    );
  }
  async expirePendingFindSolicitudCanje(
    manager: EntityManager,
    input: { attempted: string[] },
  ): Promise<ExpirePendingFindSolicitudCanjeRow[]> {
    return manager.query<ExpirePendingFindSolicitudCanjeRow[]>(
      `SELECT id_canje id FROM solicitud_canje WHERE estado='pending' AND expira_en<=clock_timestamp() AND NOT(id_canje=ANY($1::uuid[])) ORDER BY expira_en,id_canje LIMIT 100`,
      [input.attempted],
    );
  }
  async expirePendingFindSolicitudCanjeNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<ExpirePendingFindSolicitudCanjeNextRow[]> {
    return manager.query<ExpirePendingFindSolicitudCanjeNextRow[]>(
      `SELECT id_canje FROM solicitud_canje WHERE id_canje=$1 AND estado='pending' AND expira_en<=clock_timestamp() FOR UPDATE`,
      [input.id],
    );
  }

  async listRewards(manager: EntityManager, q: RewardListDto, admin = false) {
    const args = [
      q.search ? `%${q.search}%` : null,
      q.active ?? null,
      q.productId ?? null,
      admin,
    ];
    const where = `($4 OR (r.activa AND p.activo AND p.visible_menu AND c.activa)) AND ($1::text IS NULL OR r.nombre ILIKE $1 OR p.nombre ILIKE $1) AND ($2::boolean IS NULL OR r.activa=$2) AND ($3::uuid IS NULL OR r.id_producto=$3)`;
    const from = `FROM recompensa r JOIN producto p ON p.id_producto=r.id_producto LEFT JOIN categoria c ON c.id_categoria=p.id_categoria`;
    const [{ total }] = await this.listRewardsFindOperation(
      manager,
      args,
      from,
      where,
    );
    const items = await this.listRewardsFindOperationNext(
      manager,
      [...args, q.limit, (q.page - 1) * q.limit],
      rewardFields,
      from,
      where,
    );
    return { items, total, page: q.page, limit: q.limit };
  }

  async listRedemptionIds(
    manager: EntityManager,
    q: RedemptionListDto | AdminRedemptionListDto,
    clientId?: string,
  ) {
    const a = q as AdminRedemptionListDto;
    const args = [
      clientId ?? null,
      q.status ?? null,
      q.visitId ?? null,
      a.clientId ?? null,
      a.operatingDayId ?? null,
    ];
    const where = `($1::uuid IS NULL OR s.id_cliente=$1) AND ($2::text IS NULL OR s.estado=$2) AND ($3::uuid IS NULL OR s.id_visita=$3) AND ($4::uuid IS NULL OR s.id_cliente=$4) AND ($5::uuid IS NULL OR s.id_jornada=$5)`;
    const from = `FROM solicitud_canje s`;
    const [{ total }] = await this.listRewardsFindOperation(
      manager,
      args,
      from,
      where,
    );
    const rows = await this.listRedemptionsFindOperationNext(
      manager,
      [...args, q.limit, (q.page - 1) * q.limit],
      from,
      where,
    );
    return { rows, total };
  }
}
