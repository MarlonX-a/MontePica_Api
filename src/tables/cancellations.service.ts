import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import type { ClientIdentity } from './client-access.guard.js';
import type {
  AdminCancellationListDto,
  CancellationCreateDto,
  CancellationListDto,
  RefundListDto,
  RefundExecutionDto,
} from './cancellations.dto.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { ParticipantsService } from './participants.service.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';
import { PointsService } from '../points/points.service.js';
import { RewardsService } from '../rewards/rewards.service.js';

@Injectable()
export class CancellationsService {
  constructor(
    private readonly db: DataSource,
    private readonly idem: ParticipationIdempotencyService,
    private readonly participants: ParticipantsService,
    private readonly points: PointsService,
    private readonly rewards: RewardsService,
  ) {}
  private async staff(
    m: EntityManager,
    a: AuthenticatedRequestContext,
    permission: string,
    admin = false,
  ) {
    const [s] = await m.query(
      `SELECT u.activo,r.codigo AS role,s.revocada_en,s.expira_en>clock_timestamp() AS valid FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN sesion_usuario s ON s.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 FOR SHARE OF u,s`,
      [a.userId, a.sessionId],
    );
    if (!s || !s.activo || s.revocada_en || !s.valid)
      throw new UnauthorizedException('Sesion invalida.');
    if (admin && s.role !== 'admin')
      throw new ForbiddenException(
        'Solo el administrador puede decidir cancelaciones.',
      );
    const [p] = await m.query(
      `SELECT 1 FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=$1 AND p.codigo=$2`,
      [a.userId, permission],
    );
    if (!p) throw new ForbiddenException('Permiso insuficiente.');
  }
  async create(
    orderId: string,
    dto: CancellationCreateDto,
    actor: { userId?: string; guestSessionId?: string; sessionId?: string },
    client?: ClientIdentity,
    key?: string,
  ) {
    return this.idem.run(
      actor,
      `orders/${orderId.toLowerCase()}/cancellation-requests`,
      key,
      dto,
      201,
      'solicitud_cancelacion',
      async (m) => {
        if (client) {
          await this.participants.authenticate(m, client);
          const [o] = await m.query(
            `SELECT 1 FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE o.id_pedido=$1 AND c.id_cliente=$2`,
            [orderId, client.clientId],
          );
          if (!o) throw new NotFoundException('Pedido no encontrado.');
        } else
          await this.staff(
            m,
            actor as AuthenticatedRequestContext,
            'cancellations.create',
          );
      },
      async (m) => {
        await lockTableOperations(m);
        const [o] = await m.query(
          `SELECT o.estado,o.modalidad,o.id_cuenta,v.id_version,v.numero FROM pedido o JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta JOIN version_pedido v ON v.id_pedido=o.id_pedido AND v.estado='current' WHERE o.id_pedido=$1 FOR UPDATE OF o,v,c`,
          [orderId],
        );
        if (!o) throw new NotFoundException('Pedido no encontrado.');
        const eligible =
          (o.modalidad === 'local' &&
            ['preparing', 'ready'].includes(o.estado)) ||
          (o.modalidad === 'delivery' &&
            ['submitted', 'preparing', 'ready'].includes(o.estado));
        if (!eligible || o.numero !== dto.expectedVersion)
          throw new ConflictException(
            'El pedido o su version no admite cancelacion.',
          );
        const [pay] = await m.query(
          `SELECT 1 FROM liquidacion l JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado='pendingVerification'`,
          [o.id_cuenta],
        );
        if (pay)
          throw new ConflictException(
            'Existe una transferencia pendiente de revision.',
          );
        const [duplicate] = await m.query(
          `SELECT 1 FROM solicitud_cancelacion WHERE id_pedido=$1 AND estado='pending'`,
          [orderId],
        );
        if (duplicate)
          throw new ConflictException('Ya existe una solicitud pendiente.');
        if (o.modalidad === 'delivery' && o.estado === 'submitted') {
          const [paid] = await m.query(
            `SELECT 1 FROM liquidacion l JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado='confirmed'`,
            [o.id_cuenta],
          );
          if (!paid)
            throw new ConflictException(
              'Utiliza la anulacion directa para pedidos sin pago.',
            );
        }
        const [r] = await m.query(
          `INSERT INTO solicitud_cancelacion(id_pedido,id_version,estado_pedido,motivo,actor_usuario,actor_sesion_cliente,solicitada_cliente) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_solicitud AS id`,
          [
            orderId,
            o.id_version,
            o.estado,
            dto.reason,
            actor.userId ?? null,
            actor.guestSessionId ?? null,
            !!client,
          ],
        );
        await m.query(
          `INSERT INTO historial_cancelacion(id_solicitud,actor_usuario,actor_sesion_cliente,evento) VALUES ($1,$2,$3,'requested')`,
          [r.id, actor.userId ?? null, actor.guestSessionId ?? null],
        );
        await auditTableOperation(
          m,
          actor,
          'solicitud_cancelacion',
          r.id,
          'cancellation.requested',
          { orderId, reason: dto.reason },
        );
        return {
          resourceId: r.id,
          response: await this.detail(r.id, client?.clientId, m),
        };
      },
    );
  }
  async detail(
    id: string,
    clientId?: string,
    m: EntityManager = this.db.manager,
  ) {
    const [r] = await m.query(
      `SELECT s.id_solicitud AS id,s.id_pedido AS "orderId",o.modalidad AS modality,o.id_jornada AS "operatingDayId",s.id_version AS "versionId",s.estado_pedido AS "orderStatus",s.estado AS status,s.motivo AS reason,s.creada_en AS "createdAt",s.decidida_en AS "decidedAt",s.motivo_rechazo AS "rejectionReason",s.actor_usuario AS "requestedBy",s.decidida_por AS "decidedBy" FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE s.id_solicitud=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [id, clientId ?? null],
    );
    if (!r) throw new NotFoundException('Solicitud no encontrada.');
    if (clientId) {
      delete r.requestedBy;
      delete r.decidedBy;
    } else
      r.history = await m.query(
        `SELECT evento AS event,actor_usuario AS "userId",actor_sesion_cliente AS "guestSessionId",ocurrido_en AS "occurredAt" FROM historial_cancelacion WHERE id_solicitud=$1 ORDER BY ocurrido_en,id_historial`,
        [id],
      );
    return r;
  }
  async list(q: CancellationListDto, clientId?: string) {
    const a = q as AdminCancellationListDto;
    const args = [
      clientId ?? null,
      q.status ?? null,
      q.orderId ?? null,
      a.modality ?? null,
      a.operatingDayId ?? null,
    ];
    const from = `FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE ($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::text IS NULL OR s.estado=$2) AND ($3::uuid IS NULL OR s.id_pedido=$3) AND ($4::text IS NULL OR o.modalidad=$4) AND ($5::uuid IS NULL OR o.id_jornada=$5)`;
    const [{ total }] = await this.db.query(
      `SELECT count(*)::int AS total ${from}`,
      args,
    );
    const rows = await this.db.query(
      `SELECT s.id_solicitud AS id ${from} ORDER BY s.creada_en DESC,s.id_solicitud DESC LIMIT $6 OFFSET $7`,
      [...args, q.limit, (q.page - 1) * q.limit],
    );
    return {
      items: await Promise.all(
        rows.map((x: { id: string }) => this.detail(x.id, clientId)),
      ),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  async decide(
    id: string,
    decision: 'approve' | 'reject' | 'withdraw',
    a: AuthenticatedRequestContext,
    client: ClientIdentity | undefined,
    reason: string | undefined,
    key?: string,
  ) {
    a = a ?? {
      userId: client?.userId ?? '',
      sessionId: client?.userSessionId ?? '',
    };
    return this.idem.run(
      client
        ? client.guestSessionId
          ? { guestSessionId: client.guestSessionId }
          : { userId: client.userId }
        : { userId: a.userId },
      `cancellations/${id.toLowerCase()}/${decision}`,
      key,
      { reason: reason ?? null },
      200,
      'solicitud_cancelacion',
      async (m) => {
        if (client) {
          await this.participants.authenticate(m, client);
          await this.detail(id, client.clientId, m);
        } else
          await this.staff(
            m,
            a,
            decision === 'approve' || decision === 'reject'
              ? 'cancellations.decide'
              : 'cancellations.read',
            decision !== 'withdraw',
          );
      },
      async (m) => {
        await lockTableOperations(m);
        const [r] = await m.query(
          `SELECT s.*,o.id_pedido,o.id_cuenta,o.modalidad,o.estado AS current_order,c.estado AS account_status,p.id_pago,p.id_liquidacion,p.estado AS payment_status,p.importe_ctvs,l.total_ctvs FROM solicitud_cancelacion s JOIN pedido o ON o.id_pedido=s.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta LEFT JOIN liquidacion l ON l.id_cuenta=c.id_cuenta LEFT JOIN pago p ON p.id_liquidacion=l.id_liquidacion AND p.estado='confirmed' WHERE s.id_solicitud=$1 FOR UPDATE OF s,o,c`,
          [id],
        );
        if (!r) throw new NotFoundException('Solicitud no encontrada.');
        const [currentVersion] = await m.query(
          `SELECT id_version FROM version_pedido WHERE id_pedido=$1 AND estado='current'`,
          [r.id_pedido],
        );
        if (
          r.estado !== 'pending' ||
          r.current_order !== r.estado_pedido ||
          currentVersion?.id_version !== r.id_version
        )
          throw new ConflictException('La solicitud ya no está vigente.');
        if (
          decision === 'withdraw' &&
          (!r.solicitada_cliente ||
            !client ||
            (client.guestSessionId
              ? r.actor_sesion_cliente !== client.guestSessionId
              : r.actor_usuario !== client.userId))
        )
          throw new NotFoundException('Solicitud no encontrada.');
        let status =
          decision === 'approve'
            ? 'approved'
            : decision === 'reject'
              ? 'rejected'
              : 'withdrawn';
        let refund = null;
        if (decision === 'approve') {
          const [pending] = await m.query(
            `SELECT 1 FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_cuenta=$1 AND p.estado='pendingVerification'`,
            [r.id_cuenta],
          );
          if (pending)
            throw new ConflictException('Existe transferencia pendiente.');
          await m.query(
            `UPDATE pedido SET estado='cancelled' WHERE id_pedido=$1`,
            [r.id_pedido],
          );
          await this.rewards.refundForOrder(m,r.id_pedido,{userId:a.userId});
          await m.query(
            `INSERT INTO historial_pedido(id_pedido,id_version,actor_usuario,actor_tipo,evento,estado_anterior,estado_nuevo,motivo) VALUES ($1,$2,$3,'usuario','order.cancellationApproved',$4,'cancelled','cancelledByRequest')`,
            [r.id_pedido, r.id_version, a.userId, r.current_order],
          );
          await m.query(
            `WITH released AS (UPDATE reserva_inventario ri SET estado='released',resuelta_en=clock_timestamp() FROM detalle_pedido d WHERE d.id_detalle=ri.id_detalle AND d.id_version=$1 AND ri.estado='active' RETURNING ri.id_inventario,ri.cantidad) UPDATE inventario_diario i SET cantidad_reservada=i.cantidad_reservada-x.qty FROM (SELECT id_inventario,sum(cantidad)::int qty FROM released GROUP BY id_inventario)x WHERE i.id_inventario=x.id_inventario`,
            [r.id_version],
          );
          await m.query(
            `UPDATE asignacion_consumo SET estado='superseded' WHERE id_detalle IN (SELECT id_detalle FROM detalle_pedido WHERE id_version=$1) AND estado='active'`,
            [r.id_version],
          );
          await m.query(
            `UPDATE liquidacion SET estado='cancelled',anulada_por=$2,anulada_en=clock_timestamp(),motivo_anulacion='cancelledByRequest' WHERE id_cuenta=$1 AND estado='pending'`,
            [r.id_cuenta, a.userId],
          );
          await m.query(
            `UPDATE detalle_liquidacion SET vigente=false WHERE id_liquidacion IN (SELECT id_liquidacion FROM liquidacion WHERE id_cuenta=$1 AND estado='cancelled')`,
            [r.id_cuenta],
          );
          if (r.modalidad === 'delivery' && r.payment_status === 'confirmed') {
            const amount = Number(r.total_ctvs);
            if (
              !Number.isSafeInteger(amount) ||
              amount <= 0 ||
              amount > Number(r.importe_ctvs)
            )
              throw new ConflictException('Importe de devolución no válido.');
            const [d] = await m.query(
              `INSERT INTO devolucion(id_solicitud,id_pago,id_pedido,importe_ctvs,autorizada_por) VALUES ($1,$2,$3,$4,$5) RETURNING id_devolucion AS id`,
              [id, r.id_pago, r.id_pedido, amount, a.userId],
            );
            await m.query(
              `INSERT INTO historial_devolucion(id_devolucion,actor_usuario,evento,detalle) VALUES ($1,$2,'refund.authorized',$3::jsonb)`,
              [d.id, a.userId, JSON.stringify({ cancellationRequestId: id, paymentId: r.id_pago, amountCents: amount })],
            );
            refund = { id: d.id, amountCents: amount, status: 'pending' };
            await m.query(
              `UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,
              [r.id_cuenta],
            );
            await m.query(`UPDATE acumulacion_puntos SET estado='cancelled' WHERE id_pago=$1 AND estado='pending'`,[r.id_pago]);
          }
        }
        await m.query(
          `UPDATE solicitud_cancelacion SET estado=$2,decidida_por=$3,decidida_en=clock_timestamp(),motivo_rechazo=$4 WHERE id_solicitud=$1`,
          [id, status, a.userId || null, decision === 'reject' ? reason : null],
        );
        await m.query(
          `INSERT INTO historial_cancelacion(id_solicitud,actor_usuario,actor_sesion_cliente,evento) VALUES ($1,$2,$3,$4)`,
          [id, a.userId || null, client?.guestSessionId ?? null, decision],
        );
        await auditTableOperation(
          m,
          {
            userId: a.userId || client?.userId,
            guestSessionId: client?.guestSessionId,
          },
          'solicitud_cancelacion',
          id,
          `cancellation.${decision}`,
          { reason: reason ?? null, refund },
        );
        return {
          resourceId: id,
          response: { ...(await this.detail(id, client?.clientId, m)), refund },
        };
      },
    );
  }
  async refunds(q: RefundListDto, clientId?: string, admin = false) {
    const args = [clientId ?? null, q.orderId ?? null, q.paymentId ?? null, q.status ?? null, q.method ?? null];
    const from = `FROM devolucion d JOIN pago p ON p.id_pago=d.id_pago JOIN pedido o ON o.id_pedido=d.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE ($1::uuid IS NULL OR c.id_cliente=$1) AND ($2::uuid IS NULL OR d.id_pedido=$2) AND ($3::uuid IS NULL OR d.id_pago=$3) AND ($4::text IS NULL OR d.estado=$4) AND ($5::text IS NULL OR d.metodo=$5)`;
    const [{ total }] = await this.db.query(
      `SELECT count(*)::int AS total ${from}`,
      args,
    );
    const rows = await this.db.query(
      `SELECT d.id_devolucion AS id ${from} ORDER BY d.creada_en DESC,d.id_devolucion DESC LIMIT $6 OFFSET $7`,
      [...args, q.limit, (q.page - 1) * q.limit],
    );
    const items = await Promise.all(
      rows.map(
        async (x: { id: string }) =>
          this.refund(x.id, clientId, admin),
      ),
    );
    return { items, total, page: q.page, limit: q.limit };
  }
  async refund(id: string, clientId?: string, admin = false, m: EntityManager = this.db.manager) {
    const [r] = await m.query(
      `SELECT d.id_devolucion AS id,d.id_solicitud AS "cancellationRequestId",d.id_pedido AS "orderId",d.id_pago AS "paymentId",d.importe_ctvs::float8 AS "amountCents",d.estado AS status,d.creada_en AS "createdAt",d.metodo AS method,d.ejecutada_en AS "executedAt",CASE WHEN d.estado='completed' THEN d.importe_ctvs::float8 ELSE 0 END AS "refundedCents",'USD' AS currency,
        CASE WHEN $3::boolean THEN d.ejecutada_por END AS "executedBy",CASE WHEN $3::boolean THEN d.id_caja END AS "cashRegisterId",CASE WHEN $3::boolean THEN d.referencia_bancaria END AS "bankOperationReference",CASE WHEN $3::boolean THEN d.destinatario END AS "recipientName",CASE WHEN $3::boolean THEN d.observaciones END AS notes
       FROM devolucion d JOIN pedido o ON o.id_pedido=d.id_pedido JOIN cuenta_consumo c ON c.id_cuenta=o.id_cuenta WHERE d.id_devolucion=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [id, clientId ?? null, admin],
    );
    if (!r) throw new NotFoundException('Devolucion no encontrada.');
    if (!admin) {
      delete r.executedBy;
      delete r.cashRegisterId;
      delete r.bankOperationReference;
      delete r.recipientName;
      delete r.notes;
    }
    if (admin) r.history = await m.query(`SELECT actor_usuario AS "userId",evento AS event,ocurrido_en AS "occurredAt",detalle FROM historial_devolucion WHERE id_devolucion=$1 ORDER BY ocurrido_en,id_historial`, [id]);
    return r;
  }

  async executeRefund(id: string, dto: RefundExecutionDto, actor: AuthenticatedRequestContext, key?: string) {
    try {
      return await this.idem.run(
        { userId: actor.userId }, `refunds/${id.toLowerCase()}/execute`, key, dto, 200, 'devolucion',
        (m) => this.staff(m, actor, 'refunds.execute', true),
        async (m) => {
          await lockTableOperations(m);
          const [refund] = await m.query(`SELECT d.id_devolucion AS id,d.id_solicitud AS "cancellationRequestId",d.id_pago AS "paymentId",d.id_pedido AS "orderId",d.importe_ctvs::float8 AS amount,d.estado,p.estado AS "paymentStatus",p.importe_ctvs::float8 AS "paidAmount",s.estado AS "cancellationStatus"
            FROM devolucion d JOIN pago p ON p.id_pago=d.id_pago JOIN solicitud_cancelacion s ON s.id_solicitud=d.id_solicitud
            WHERE d.id_devolucion=$1 FOR UPDATE OF d,p,s`, [id]);
          if (!refund) throw new NotFoundException('Devolucion no encontrada.');
          if (refund.estado !== 'pending' || refund.cancellationStatus !== 'approved' || refund.paymentStatus !== 'confirmed') throw new ConflictException('La devolucion ya no puede ejecutarse.');
          if (!Number.isSafeInteger(refund.amount) || refund.amount <= 0 || !Number.isSafeInteger(refund.paidAmount) || refund.amount > refund.paidAmount) throw new ConflictException('El importe autorizado supera el pago confirmado.');

          let cashRegisterId: string | null = null;
          if (dto.method === 'cash') {
            const [day] = await m.query(`SELECT j.id_jornada AS id,c.id_caja AS "cashRegisterId",c.monto_inicial_ctvs::text AS opening,j.estado AS "dayStatus",c.estado AS "cashStatus"
              FROM configuracion_operativa op JOIN jornada_operativa j ON j.fecha_operativa=timezone(op.zona_horaria,clock_timestamp())::date JOIN caja c ON c.id_jornada=j.id_jornada
              WHERE op.id_configuracion=1 FOR UPDATE OF j,c`, []);
            if (!day || day.dayStatus !== 'open' || day.cashStatus !== 'open') throw new ConflictException('Se requiere jornada y caja actuales abiertas para devolver en efectivo.');
            cashRegisterId = day.cashRegisterId;
            const [totals] = await m.query(`SELECT
              COALESCE((SELECT sum(p.importe_ctvs) FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion WHERE l.id_caja=$1 AND p.metodo='cash' AND p.estado='confirmed'),0)::text AS income,
              COALESCE((SELECT sum(x.importe_ctvs) FROM salida_caja_devolucion x WHERE x.id_caja=$1),0)::text AS refunds`, [cashRegisterId]);
            const balance = BigInt(day.opening) + BigInt(totals.income) - BigInt(totals.refunds);
            if (balance < BigInt(refund.amount)) throw new ConflictException('La caja no tiene saldo suficiente para esta devolucion.');
          }

          const [updated] = await m.query(`UPDATE devolucion SET estado='completed',metodo=$2,ejecutada_por=$3,ejecutada_en=clock_timestamp(),referencia_bancaria=$4,destinatario=$5,observaciones=$6,id_caja=$7 WHERE id_devolucion=$1 RETURNING id_devolucion`, [id,dto.method,actor.userId,dto.bankOperationReference ?? null,dto.recipientName ?? null,dto.notes ?? null,cashRegisterId]);
          if (dto.method === 'cash') await m.query(`INSERT INTO salida_caja_devolucion(id_devolucion,id_caja,importe_ctvs,registrada_por) VALUES ($1,$2,$3,$4)`, [id,cashRegisterId,refund.amount,actor.userId]);
          await m.query(`INSERT INTO historial_devolucion(id_devolucion,actor_usuario,evento,detalle) VALUES ($1,$2,'refund.completed',$3::jsonb)`, [id,actor.userId,JSON.stringify({method:dto.method,amountCents:refund.amount,cashRegisterId,bankOperationReference:dto.bankOperationReference ?? null,recipientName:dto.recipientName ?? null,notes:dto.notes ?? null})]);
          await this.points.refund(m,id,actor.userId);
          await auditTableOperation(m,{userId:actor.userId},'devolucion',id,'refund.completed',{method:dto.method,amountCents:refund.amount,cashRegisterId});
          return { resourceId: updated.id_devolucion, response: await this.refund(id,undefined,true,m) };
        },
      );
    } catch (error) {
      const code = error instanceof QueryFailedError ? (error as QueryFailedError & { driverError?: { code?: string; constraint?: string } }).driverError : undefined;
      if (code?.code === '23505' && code.constraint === 'uq_devolucion_referencia_bancaria') throw new ConflictException('La referencia bancaria ya fue utilizada.');
      throw error;
    }
  }
}
