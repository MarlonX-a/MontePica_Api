import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { PointsService } from '../points/points.service.js';
import { RewardsService } from '../rewards/rewards.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import type { PaymentListDto } from './payments.dto.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { auditTableOperation } from './table-audit.js';
import { lockTableOperations } from './table-operations.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: DataSource,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly points: PointsService,
    private readonly rewards: RewardsService,
    private readonly persistence: PaymentsRepository = new PaymentsRepository(),
  ) {}

  private async authorize(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
  ) {
    const [session] = await this.persistence.authorizeFindUsuario(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
    });
    if (!session || !session.activo || session.revocada_en || !session.valid)
      throw new UnauthorizedException('Sesión no válida.');
    const [permission] = await this.persistence.authorizeFindUsuarioNext(m, {
      userId: actor.userId,
    });
    if (!permission)
      throw new ForbiddenException('No tienes permiso para cobrar.');
  }

  async collect(
    id: string,
    receivedCents: number | null,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    const zero = receivedCents === null;
    return this.idempotency.run(
      { userId: actor.userId },
      `settlements/${id.toLowerCase()}/${zero ? 'complete-without-payment' : 'cash-payments'}`,
      key,
      zero ? {} : { receivedCents },
      zero ? 200 : 201,
      'liquidacion',
      (m) => this.authorize(m, actor),
      async (m) => {
        const zone = await lockTableOperations(m);
        const [ref] = await this.persistence.collectFindLiquidacion(m, {
          id: id,
        });
        if (!ref) throw new NotFoundException('Liquidación no encontrada.');
        if (ref.modalidad === 'delivery')
          throw new ConflictException(
            'Los domicilios requieren transferencia.',
          );
        const [cash] = await this.persistence.collectFindCaja(m, {
          id_caja: ref.id_caja,
          zone: zone,
        });
        if (
          !cash ||
          cash.estado !== 'open' ||
          cash.day_status !== 'open' ||
          !cash.current
        )
          throw new ConflictException(
            'La caja debe estar abierta en la jornada actual.',
          );
        await this.persistence.collectFindVisitaMesa(m, {
          id_visita: ref.id_visita,
        });
        const [participant] = await this.persistence.collectFindParticipante(
          m,
          { id_participante: ref.id_participante },
        );
        const [account] = await this.persistence.collectFindCuentaConsumo(m, {
          id_cuenta: ref.id_cuenta,
        });
        const [settlement] = await this.persistence.collectFindLiquidacionNext(
          m,
          { id: id },
        );
        if (
          settlement.estado !== 'pending' ||
          account.estado !== 'open' ||
          participant.estado !== 'approved'
        )
          throw new ConflictException(
            'La liquidación, cuenta o participación ya no están disponibles.',
          );
        const [pendingTransfer] = await this.persistence.collectFindPago(m, {
          id: id,
        });
        if (pendingTransfer)
          throw new ConflictException(
            'Existe una transferencia pendiente de verificación.',
          );
        if (
          !Number.isSafeInteger(settlement.total) ||
          (zero
            ? settlement.total !== 0
            : settlement.total <= 0 || receivedCents! < settlement.total)
        )
          throw new ConflictException(
            'Importe insuficiente o liquidación incompatible.',
          );
        let payment = null;
        if (!zero) {
          const [created] = await this.persistence.collectInsertPago(m, {
            id: id,
            total: settlement.total,
            receivedCents: receivedCents,
            changeCents: receivedCents! - settlement.total,
            userId: actor.userId,
          });
          await this.persistence.collectInsertHistorialPago(m, {
            id: created.id,
            userId: actor.userId,
          });
          await this.points.recordConfirmedPayment(m, created.id);
          payment = await this.detail(created.id, undefined, true, m);
        }
        await this.persistence.collectUpdateLiquidacion(m, {
          id: id,
          userId: actor.userId,
          resolution: zero ? 'zeroTotal' : 'cash',
        });
        await this.persistence.collectUpdateCuentaConsumo(m, {
          id_cuenta: ref.id_cuenta,
        });
        await this.rewards.releaseForParticipant(m, ref.id_participante);
        await this.persistence.collectUpdateParticipante(m, {
          id_participante: ref.id_participante,
        });
        await auditTableOperation(
          m,
          { userId: actor.userId },
          'liquidacion',
          id,
          zero ? 'settlement.zero_completed' : 'payment.confirmed',
          {
            paymentId: payment?.id ?? null,
            accountId: ref.id_cuenta,
            totalCents: settlement.total,
          },
        );
        return {
          resourceId: id,
          response: {
            payment,
            settlement: { id, status: 'settled' },
            account: { id: ref.id_cuenta, status: 'closed' },
            participant: { id: ref.id_participante, status: 'finished' },
          },
        };
      },
    );
  }

  async detail(
    id: string,
    clientId?: string,
    admin = false,
    m: EntityManager = this.db.manager,
  ) {
    const [payment] = await this.persistence.detailFindDevolucion(m, {
      id: id,
      clientId: clientId ?? null,
    });
    if (!payment) throw new NotFoundException('Pago no encontrado.');
    const [receipt] = await this.persistence.detailFindComprobante(m, {
      id: id,
    });
    payment.receipt = receipt ?? null;
    if (admin) {
      const [registrar] = await this.persistence.detailFindPago(m, { id: id });
      payment.registeredBy = registrar.registeredBy;
      payment.registeredByGuestSessionId = registrar.registeredByGuestSessionId;
      payment.verifiedBy = registrar.verifiedBy;
      payment.bankOperationReference = registrar.bankOperationReference;
      payment.history = await this.persistence.detailFindHistorialPago(m, {
        id: id,
      });
    }
    return payment;
  }

  async list(query: PaymentListDto, clientId?: string) {
    const { rows, total } = await this.persistence.listPaymentIds(
      this.db.manager,
      query,
      clientId,
    );
    return {
      items: await Promise.all(
        rows.map((row) => this.detail(row.id, clientId)),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}
