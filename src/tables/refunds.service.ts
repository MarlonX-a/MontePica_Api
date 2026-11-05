import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { PointsService } from '../points/points.service.js';
import type { RefundExecutionDto, RefundListDto } from './cancellations.dto.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { RefundsRepository } from './repositories/refunds.repository.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';
@Injectable()
export class RefundsService {
  constructor(
    private readonly db: DataSource,
    private readonly idem: ParticipationIdempotencyService,
    private readonly points: PointsService,
    private readonly persistence: RefundsRepository = new RefundsRepository(),
  ) {}
  private async staff(
    m: EntityManager,
    a: AuthenticatedRequestContext,
    permission: string,
    admin = false,
  ) {
    const [s] = await this.persistence.staffFindUsuario(m, {
      userId: a.userId,
      sessionId: a.sessionId,
    });
    if (!s || !s.activo || s.revocada_en || !s.valid)
      throw new UnauthorizedException('Sesion invalida.');
    if (admin && s.role !== 'admin')
      throw new ForbiddenException(
        'Solo el administrador puede decidir cancelaciones.',
      );
    const [p] = await this.persistence.staffFindUsuarioNext(m, {
      userId: a.userId,
      permission: permission,
    });
    if (!p) throw new ForbiddenException('Permiso insuficiente.');
  }
  async refunds(q: RefundListDto, clientId?: string, admin = false) {
    const { rows, total } = await this.persistence.listRefundIds(
      this.db.manager,
      q,
      clientId,
    );
    const items = await Promise.all(
      rows.map((row) => this.refund(row.id, clientId, admin)),
    );
    return { items, total, page: q.page, limit: q.limit };
  }
  async refund(
    id: string,
    clientId?: string,
    admin = false,
    m: EntityManager = this.db.manager,
  ) {
    const [r] = await this.persistence.refundFindDevolucion(m, {
      id: id,
      clientId: clientId ?? null,
      admin: admin,
    });
    if (!r) throw new NotFoundException('Devolucion no encontrada.');
    if (!admin) {
      delete r.executedBy;
      delete r.cashRegisterId;
      delete r.bankOperationReference;
      delete r.recipientName;
      delete r.notes;
    }
    if (admin)
      r.history = await this.persistence.refundFindHistorialDevolucion(m, {
        id: id,
      });
    return r;
  }
  async executeRefund(
    id: string,
    dto: RefundExecutionDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    try {
      return await this.idem.run(
        { userId: actor.userId },
        `refunds/${id.toLowerCase()}/execute`,
        key,
        dto,
        200,
        'devolucion',
        (m) => this.staff(m, actor, 'refunds.execute', true),
        async (m) => {
          await lockTableOperations(m);
          const [refund] = await this.persistence.executeRefundFindDevolucion(
            m,
            { id: id },
          );
          if (!refund) throw new NotFoundException('Devolucion no encontrada.');
          if (
            refund.estado !== 'pending' ||
            refund.cancellationStatus !== 'approved' ||
            refund.paymentStatus !== 'confirmed'
          )
            throw new ConflictException(
              'La devolucion ya no puede ejecutarse.',
            );
          if (
            !Number.isSafeInteger(refund.amount) ||
            refund.amount <= 0 ||
            !Number.isSafeInteger(refund.paidAmount) ||
            refund.amount > refund.paidAmount
          )
            throw new ConflictException(
              'El importe autorizado supera el pago confirmado.',
            );

          let cashRegisterId: string | null = null;
          if (dto.method === 'cash') {
            const [day] =
              await this.persistence.executeRefundFindConfiguracionOperativa(m);
            if (!day || day.dayStatus !== 'open' || day.cashStatus !== 'open')
              throw new ConflictException(
                'Se requiere jornada y caja actuales abiertas para devolver en efectivo.',
              );
            cashRegisterId = day.cashRegisterId;
            const [totals] = await this.persistence.executeRefundFindPago(m, {
              cashRegisterId: cashRegisterId,
            });
            const balance =
              BigInt(day.opening) +
              BigInt(totals.income) -
              BigInt(totals.refunds);
            if (balance < BigInt(refund.amount))
              throw new ConflictException(
                'La caja no tiene saldo suficiente para esta devolucion.',
              );
          }

          const [updated] =
            await this.persistence.executeRefundUpdateDevolucion(m, {
              id: id,
              method: dto.method,
              userId: actor.userId,
              bankOperationReference: dto.bankOperationReference ?? null,
              recipientName: dto.recipientName ?? null,
              notes: dto.notes ?? null,
              cashRegisterId: cashRegisterId,
            });
          if (dto.method === 'cash')
            await this.persistence.executeRefundInsertSalidaCajaDevolucion(m, {
              id: id,
              cashRegisterId: cashRegisterId,
              amount: refund.amount,
              userId: actor.userId,
            });
          await this.persistence.executeRefundInsertHistorialDevolucion(m, {
            id: id,
            userId: actor.userId,
            detailJson: JSON.stringify({
              method: dto.method,
              amountCents: refund.amount,
              cashRegisterId,
              bankOperationReference: dto.bankOperationReference ?? null,
              recipientName: dto.recipientName ?? null,
              notes: dto.notes ?? null,
            }),
          });
          await this.points.refund(m, id, actor.userId);
          await auditTableOperation(
            m,
            { userId: actor.userId },
            'devolucion',
            id,
            'refund.completed',
            { method: dto.method, amountCents: refund.amount, cashRegisterId },
          );
          return {
            resourceId: updated.id_devolucion,
            response: await this.refund(id, undefined, true, m),
          };
        },
      );
    } catch (error) {
      const code =
        error instanceof QueryFailedError
          ? (
              error as QueryFailedError & {
                driverError?: { code?: string; constraint?: string };
              }
            ).driverError
          : undefined;
      if (
        code?.code === '23505' &&
        code.constraint === 'uq_devolucion_referencia_bancaria'
      )
        throw new ConflictException('La referencia bancaria ya fue utilizada.');
      throw error;
    }
  }
}
