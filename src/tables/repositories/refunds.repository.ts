import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';
import type { RefundListDto } from '../cancellations.dto.js';
import type { EntityManager } from 'typeorm';
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
export class RefundsRepository {
  async staffFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<StaffFindUsuarioRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      undefined,
    );
    return row ? [row] : [];
  }
  async staffFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string; permission: string },
  ): Promise<StaffFindUsuarioNextRow[]> {
    return (await new AuthorizationRepository().hasPermission(
      manager,
      input.userId,
      input.permission,
    ))
      ? [{ '1': '1' }]
      : [];
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
  private async refundsFindOperationNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<RefundsFindOperationNextRow[]> {
    return manager.query<RefundsFindOperationNextRow[]>(
      `SELECT d.id_devolucion AS id ${fragment0} ORDER BY d.creada_en DESC,d.id_devolucion DESC LIMIT $6 OFFSET $7`,
      parameters,
    );
  }
  async refundFindDevolucion(
    manager: EntityManager,
    input: { id: string; clientId: string | null; admin: boolean },
  ): Promise<RefundFindDevolucionRow[]> {
    return manager.query<RefundFindDevolucionRow[]>(
      `SELECT d.id_devolucion AS id,d.id_solicitud AS "cancellationRequestId",d.id_pedido AS "orderId",d.id_pago AS "paymentId",d.importe_ctvs::float8 AS "amountCents",d.estado AS status,d.creada_en AS "createdAt",d.metodo AS method,d.ejecutada_en AS "executedAt",CASE WHEN d.estado='completed' THEN d.importe_ctvs::float8 ELSE 0 END AS "refundedCents",'USD' AS currency,
        CASE WHEN $3::boolean THEN d.ejecutada_por END AS "executedBy",CASE WHEN $3::boolean THEN d.id_caja END AS "cashRegisterId",CASE WHEN $3::boolean THEN d.referencia_bancaria END AS "bankOperationReference",CASE WHEN $3::boolean THEN d.destinatario END AS "recipientName",CASE WHEN $3::boolean THEN d.observaciones END AS notes
       FROM devolucion d JOIN pedido o ON o.id_pedido=d.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE d.id_devolucion=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [input.id, input.clientId, input.admin],
    );
  }
  async refundFindHistorialDevolucion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RefundFindHistorialDevolucionRow[]> {
    return manager.query<RefundFindHistorialDevolucionRow[]>(
      `SELECT actor_usuario AS "userId",evento AS event,ocurrido_en AS "occurredAt",detalle FROM historial_devolucion WHERE id_devolucion=$1 ORDER BY ocurrido_en,id_historial`,
      [input.id],
    );
  }
  async executeRefundFindDevolucion(
    manager: EntityManager,
    input: { id: string },
  ): Promise<ExecuteRefundFindDevolucionRow[]> {
    return manager.query<ExecuteRefundFindDevolucionRow[]>(
      `SELECT d.id_devolucion AS id,d.id_solicitud AS "cancellationRequestId",d.id_pago AS "paymentId",d.id_pedido AS "orderId",d.importe_ctvs::float8 AS amount,d.estado,p.estado AS "paymentStatus",p.importe_ctvs::float8 AS "paidAmount",s.estado AS "cancellationStatus"
            FROM devolucion d JOIN pago p ON p.id_pago=d.id_pago JOIN solicitud_cancelacion s ON s.id_solicitud=d.id_solicitud
            WHERE d.id_devolucion=$1 FOR UPDATE OF d,p,s`,
      [input.id],
    );
  }
  async executeRefundFindConfiguracionOperativa(
    manager: EntityManager,
  ): Promise<ExecuteRefundFindConfiguracionOperativaRow[]> {
    return manager.query<ExecuteRefundFindConfiguracionOperativaRow[]>(
      `SELECT j.id_jornada AS id,c.id_caja AS "cashRegisterId",c.monto_inicial_ctvs::text AS opening,j.estado AS "dayStatus",c.estado AS "cashStatus"
              FROM configuracion_operativa op JOIN jornada_operativa j ON j.fecha_operativa=timezone(op.zona_horaria,clock_timestamp())::date JOIN caja c ON c.id_jornada=j.id_jornada
              WHERE op.id_configuracion=1 FOR UPDATE OF j,c`,
      [],
    );
  }
  async executeRefundFindPago(
    manager: EntityManager,
    input: { cashRegisterId: string },
  ): Promise<ExecuteRefundFindPagoRow[]> {
    return manager.query<ExecuteRefundFindPagoRow[]>(
      `SELECT
              COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=$1 AND p.metodo='cash' AND p.estado='confirmed'),0)::text AS income,
              COALESCE((SELECT sum(x.importe_ctvs) FROM salida_caja_devolucion x WHERE x.id_caja=$1),0)::text AS refunds`,
      [input.cashRegisterId],
    );
  }
  async executeRefundUpdateDevolucion(
    manager: EntityManager,
    input: {
      id: string;
      method: 'cash' | 'transfer';
      userId: string;
      bankOperationReference: string | null;
      recipientName: string | null;
      notes: string | null;
      cashRegisterId: string | null;
    },
  ): Promise<ExecuteRefundUpdateDevolucionRow[]> {
    const [rows] = await manager.query<
      [ExecuteRefundUpdateDevolucionRow[], number]
    >(
      `UPDATE devolucion SET estado='completed',metodo=$2,ejecutada_por=$3,ejecutada_en=clock_timestamp(),referencia_bancaria=$4,destinatario=$5,observaciones=$6,id_caja=$7 WHERE id_devolucion=$1 RETURNING id_devolucion`,
      [
        input.id,
        input.method,
        input.userId,
        input.bankOperationReference,
        input.recipientName,
        input.notes,
        input.cashRegisterId,
      ],
    );
    return rows;
  }
  async executeRefundInsertSalidaCajaDevolucion(
    manager: EntityManager,
    input: {
      id: string;
      cashRegisterId: string | null;
      amount: number;
      userId: string;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO salida_caja_devolucion(id_devolucion,id_caja,importe_ctvs,registrada_por) VALUES ($1,$2,$3,$4)`,
      [input.id, input.cashRegisterId, input.amount, input.userId],
    );
  }
  async executeRefundInsertHistorialDevolucion(
    manager: EntityManager,
    input: { id: string; userId: string; detailJson: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_devolucion(id_devolucion,actor_usuario,evento,detalle) VALUES ($1,$2,'refund.completed',$3::jsonb)`,
      [input.id, input.userId, input.detailJson],
    );
  }
  async listRefundIds(
    manager: EntityManager,
    q: RefundListDto,
    clientId?: string,
  ) {
    const args = [
      clientId ?? null,
      q.orderId ?? null,
      q.paymentId ?? null,
      q.status ?? null,
      q.method ?? null,
    ];
    const from = `FROM devolucion d JOIN pago p ON p.id_pago=d.id_pago JOIN pedido o ON o.id_pedido=d.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE ($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::uuid IS NULL OR d.id_pedido=$2) AND ($3::uuid IS NULL OR d.id_pago=$3) AND ($4::text IS NULL OR d.estado=$4) AND ($5::text IS NULL OR d.metodo=$5)`;
    const [{ total }] = await this.listFindOperation(manager, args, from);
    const rows = await this.refundsFindOperationNext(
      manager,
      [...args, q.limit, (q.page - 1) * q.limit],
      from,
    );

    return { rows, total };
  }
}
