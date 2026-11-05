import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';

import type { AdminPaymentListDto, PaymentListDto } from '../payments.dto.js';

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
export class PaymentsRepository {
  async authorizeFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<AuthorizeFindUsuarioRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      undefined,
    );
    return row ? [row] : [];
  }
  async authorizeFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string },
  ): Promise<AuthorizeFindUsuarioNextRow[]> {
    return (await new AuthorizationRepository().hasPermission(
      manager,
      input.userId,
      'payments.collect',
    ))
      ? [{ '1': '1' }]
      : [];
  }
  async collectFindLiquidacion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CollectFindLiquidacionRow[]> {
    return manager.query<CollectFindLiquidacionRow[]>(
      `SELECT l.id_cuenta,c.id_participante,c.modalidad,p.id_visita,l.id_caja FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta LEFT JOIN participante p ON p.id_participante=c.id_participante WHERE l.id_liquidacion=$1`,
      [input.id],
    );
  }
  async collectFindCaja(
    manager: EntityManager,
    input: { id_caja: string; zone: string },
  ): Promise<CollectFindCajaRow[]> {
    return manager.query<CollectFindCajaRow[]>(
      `SELECT c.estado,j.estado AS day_status,j.fecha_operativa=timezone($2,clock_timestamp())::date AS current FROM caja c JOIN jornada_operativa j ON j.id_jornada=c.id_jornada WHERE c.id_caja=$1 FOR UPDATE OF j,c`,
      [input.id_caja, input.zone],
    );
  }
  async collectFindVisitaMesa(
    manager: EntityManager,
    input: { id_visita: string },
  ): Promise<void> {
    await manager.query(
      'SELECT 1 FROM visita_mesa WHERE id_visita=$1 FOR UPDATE',
      [input.id_visita],
    );
  }
  async collectFindParticipante(
    manager: EntityManager,
    input: { id_participante: string },
  ): Promise<CollectFindParticipanteRow[]> {
    return manager.query<CollectFindParticipanteRow[]>(
      'SELECT estado FROM participante WHERE id_participante=$1 FOR UPDATE',
      [input.id_participante],
    );
  }
  async collectFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<CollectFindCuentaConsumoRow[]> {
    return manager.query<CollectFindCuentaConsumoRow[]>(
      'SELECT estado FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',
      [input.id_cuenta],
    );
  }
  async collectFindLiquidacionNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CollectFindLiquidacionNextRow[]> {
    return manager.query<CollectFindLiquidacionNextRow[]>(
      'SELECT estado,total_ctvs::float8 AS total FROM liquidacion WHERE id_liquidacion=$1 FOR UPDATE',
      [input.id],
    );
  }
  async collectFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CollectFindPagoRow[]> {
    return manager.query<CollectFindPagoRow[]>(
      `SELECT 1 FROM pago WHERE id_liquidacion=$1 AND metodo='transfer' AND estado='pendingVerification'`,
      [input.id],
    );
  }
  async collectInsertPago(
    manager: EntityManager,
    input: {
      id: string;
      total: number;
      receivedCents: number;
      changeCents: number;
      userId: string;
    },
  ): Promise<CollectInsertPagoRow[]> {
    return manager.query<CollectInsertPagoRow[]>(
      `INSERT INTO pago(id_liquidacion,metodo,estado,importe_ctvs,recibido_ctvs,cambio_ctvs,registrado_usuario) VALUES ($1,'cash','confirmed',$2,$3,$4,$5) RETURNING id_pago AS id`,
      [
        input.id,
        input.total,
        input.receivedCents,
        input.changeCents,
        input.userId,
      ],
    );
  }
  async collectInsertHistorialPago(
    manager: EntityManager,
    input: { id: string; userId: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pago(id_pago,actor_usuario,estado_nuevo,evento) VALUES ($1,$2,'confirmed','payment.confirmed')`,
      [input.id, input.userId],
    );
  }
  async collectUpdateLiquidacion(
    manager: EntityManager,
    input: { id: string; userId: string; resolution: 'cash' | 'zeroTotal' },
  ): Promise<void> {
    await manager.query(
      `UPDATE liquidacion SET estado='settled',cerrada_en=clock_timestamp(),cerrada_por=$2,resolucion=$3 WHERE id_liquidacion=$1`,
      [input.id, input.userId, input.resolution],
    );
  }
  async collectUpdateCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,
      [input.id_cuenta],
    );
  }
  async collectUpdateParticipante(
    manager: EntityManager,
    input: { id_participante: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE participante SET estado='finished',finalizada_en=clock_timestamp() WHERE id_participante=$1`,
      [input.id_participante],
    );
  }
  async detailFindDevolucion(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<DetailFindDevolucionRow[]> {
    return manager.query<DetailFindDevolucionRow[]>(
      `SELECT p.id_pago AS id,p.id_liquidacion AS "settlementId",l.id_cuenta AS "accountId",l.id_caja AS "cashRegisterId",p.metodo AS method,p.estado AS status,p.importe_ctvs::float8 AS "amountCents",CASE WHEN p.estado='confirmed' THEN p.importe_ctvs::float8 ELSE 0 END AS "paidCents",COALESCE((SELECT d.importe_ctvs FROM devolucion d WHERE d.id_pago=p.id_pago AND d.estado='pending'),0)::float8 AS "refundPendingCents",COALESCE((SELECT d.importe_ctvs FROM devolucion d WHERE d.id_pago=p.id_pago AND d.estado='completed'),0)::float8 AS "refundedCents",p.recibido_ctvs::float8 AS "receivedCents",p.cambio_ctvs::float8 AS "changeCents",'USD' AS currency,p.creado_en AS "createdAt",p.verificado_en AS "verifiedAt",p.motivo_rechazo AS "rejectionReason" FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE p.id_pago=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [input.id, input.clientId],
    );
  }
  async detailFindComprobante(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindComprobanteRow[]> {
    return manager.query<DetailFindComprobanteRow[]>(
      `SELECT mime,tamano AS size,sha256,cargado_en AS "uploadedAt" FROM comprobante WHERE id_pago=$1`,
      [input.id],
    );
  }
  async detailFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindPagoRow[]> {
    return manager.query<DetailFindPagoRow[]>(
      'SELECT registrado_usuario AS "registeredBy",registrado_sesion_cliente AS "registeredByGuestSessionId",verificado_por AS "verifiedBy",operacion_bancaria_confirmada AS "bankOperationReference" FROM pago WHERE id_pago=$1',
      [input.id],
    );
  }
  async detailFindHistorialPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DetailFindHistorialPagoRow[]> {
    return manager.query<DetailFindHistorialPagoRow[]>(
      `SELECT actor_usuario AS "userId",actor_sesion_cliente AS "guestSessionId",evento AS event,estado_anterior AS "previousStatus",estado_nuevo AS "newStatus",ocurrido_en AS "occurredAt" FROM historial_pago WHERE id_pago=$1 ORDER BY ocurrido_en,id_historial_pago`,
      [input.id],
    );
  }
  private async listFindOperation(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListFindOperationRow[]> {
    return manager.query<ListFindOperationRow[]>(
      `SELECT count(*)::int AS total ${fragment0}`,
      parameters,
    );
  }
  private async listFindOperationNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListFindOperationNextRow[]> {
    return manager.query<ListFindOperationNextRow[]>(
      `SELECT p.id_pago AS id ${fragment0} ORDER BY p.creado_en DESC,p.id_pago DESC LIMIT $7 OFFSET $8`,
      parameters,
    );
  }

  async listPaymentIds(
    manager: EntityManager,
    query: PaymentListDto,
    clientId?: string,
  ) {
    const admin = query as AdminPaymentListDto;
    const args = [
      clientId ?? null,
      query.settlementId ?? null,
      admin.cashRegisterId ?? null,
      admin.accountId ?? null,
      query.method ?? null,
      query.status ?? null,
    ];
    const from = `FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE ($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::uuid IS NULL OR l.id_liquidacion=$2) AND ($3::uuid IS NULL OR l.id_caja=$3) AND ($4::uuid IS NULL OR l.id_cuenta=$4) AND ($5::text IS NULL OR p.metodo=$5) AND ($6::text IS NULL OR p.estado=$6)`;
    const [{ total }] = await this.listFindOperation(manager, args, from);
    const rows: Array<{ id: string }> = await this.listFindOperationNext(
      manager,
      [...args, query.limit, (query.page - 1) * query.limit],
      from,
    );

    return { rows, total };
  }
}
