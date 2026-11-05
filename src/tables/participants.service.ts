import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { RewardsService } from '../rewards/rewards.service.js';
import type { ClientIdentity } from './client-access.guard.js';
import type {
  ParticipantQueryDto,
  RequestParticipationDto,
  VisitsQueryDto,
} from './dto/participation.dto.js';
import { hashAccessSecret } from './guest-sessions.service.js';
import { ParticipationIdempotencyService } from './participation-idempotency.service.js';
import { ParticipantsRepository } from './repositories/participants.repository.js';
import { auditTableOperation, type TableActor } from './table-audit.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly db: DataSource,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly rewards: RewardsService,
    private readonly persistence: ParticipantsRepository = new ParticipantsRepository(),
  ) {}

  async authenticate(
    manager: EntityManager,
    actor: ClientIdentity,
    participantId?: string,
  ) {
    const rows = actor.guestSessionId
      ? await this.persistence.authenticateFindSesionCliente(manager, {
          guestSessionId: actor.guestSessionId,
          clientId: actor.clientId,
        })
      : await this.persistence.authenticateFindCliente(manager, {
          clientId: actor.clientId,
          userId: actor.userId,
          userSessionId: actor.userSessionId,
        });
    if (!rows.length) throw new UnauthorizedException('Sesión no válida.');
    if (participantId) {
      const own = await this.persistence.authenticateFindParticipante(manager, {
        participantId: participantId,
        clientId: actor.clientId,
      });
      if (!own.length)
        throw new NotFoundException('Participación no encontrada.');
    }
  }

  private actor(identity: ClientIdentity): TableActor {
    return identity.guestSessionId
      ? { guestSessionId: identity.guestSessionId }
      : { userId: identity.userId };
  }

  async request(
    visitId: string,
    dto: RequestParticipationDto,
    actor: ClientIdentity,
    key?: string,
  ) {
    const operation = `visits/${visitId.toLowerCase()}/participants`;
    return this.idempotency.run(
      this.actor(actor),
      operation,
      key,
      { alias: dto.alias, qrToken: dto.qrToken },
      201,
      'participante',
      (m) => this.authenticate(m, actor),
      async (m) => {
        const zone = await lockTableOperations(m);
        const table = await lockActiveVisit(m, visitId, zone);
        if (!table.qrHash || table.qrHash !== hashAccessSecret(dto.qrToken))
          throw new NotFoundException('QR vencido o inválido.');
        await this.persistence.requestFindCliente(m, {
          clientId: actor.clientId,
        });
        const duplicate = await this.persistence.requestFindParticipante(m, {
          visitId: visitId,
          clientId: actor.clientId,
        });
        if (duplicate.length)
          throw new ConflictException(
            'Ya existe una participación en esta visita.',
          );
        const [p] = await this.persistence.requestInsertParticipante(m, {
          visitId: visitId,
          clientId: actor.clientId,
          guestSessionId: actor.guestSessionId ?? null,
          userId: actor.userId ?? null,
          alias: dto.alias,
          qrVersion: table.qrVersion,
        });
        const response = await this.getParticipant(m, p.id);
        await auditTableOperation(
          m,
          this.actor(actor),
          'participante',
          p.id,
          'participant.requested',
          {
            visitId,
            clientId: actor.clientId,
            alias: dto.alias,
            qrVersion: table.qrVersion,
          },
        );
        return { resourceId: p.id, response };
      },
    );
  }

  async getParticipant(manager: EntityManager, id: string, clientId?: string) {
    const [item] = await this.persistence.getParticipantFindParticipante(
      manager,
      { id: id, clientId: clientId ?? null },
    );
    if (!item) throw new NotFoundException('Participación no encontrada.');
    return item;
  }

  detail(id: string, actor: ClientIdentity) {
    return this.getParticipant(this.db.manager, id, actor.clientId);
  }

  async participants(
    query: ParticipantQueryDto,
    filter: { clientId?: string; visitId?: string },
  ) {
    if (filter.visitId) {
      const exists = await this.persistence.participantsFindVisitaMesa(
        this.db.manager,
        { visitId: filter.visitId },
      );
      if (!exists.length) throw new NotFoundException('Visita no encontrada.');
    }
    return this.persistence.listParticipants(this.db.manager, query, filter);
  }

  async visits(query: VisitsQueryDto) {
    return this.persistence.listVisits(this.db.manager, query);
  }

  async visit(id: string) {
    const [row] = await this.persistence.visitFindVisitaMesa(this.db.manager, {
      id: id,
    });
    if (!row) throw new NotFoundException('Visita no encontrada.');
    return row;
  }

  async transition(
    id: string,
    mode: 'approve' | 'reject' | 'finish' | 'leave',
    actor: TableActor,
    key?: string,
    reason?: string,
    client?: ClientIdentity,
  ) {
    const operation = `participants/${id.toLowerCase()}/${mode}`;
    const auth = async (m: EntityManager) => {
      if (client) await this.authenticate(m, client, id);
    };
    return this.idempotency.run(
      actor,
      operation,
      key,
      { reason: reason ?? null },
      200,
      'participante',
      auth,
      async (m) => {
        const zone = await lockTableOperations(m);
        const [ref] = await this.persistence.transitionFindParticipante(m, {
          id: id,
        });
        if (!ref) throw new NotFoundException('Participación no encontrada.');
        if (mode === 'approve') await lockActiveVisit(m, ref.visitId, zone);
        else await this.lockVisit(m, ref.visitId);
        await this.persistence.requestFindCliente(m, {
          clientId: ref.clientId,
        });
        const [p] = await this.persistence.transitionFindParticipanteNext(m, {
          id: id,
        });
        if (mode === 'approve') {
          if (p.estado !== 'pending')
            throw new ConflictException('La solicitud ya no está pendiente.');
          const [v] = await this.persistence.transitionFindVisitaMesa(m, {
            visitId: ref.visitId,
          });
          if (p.qr_version_aprobada !== v.version)
            throw new ConflictException('El QR ha sido renovado.');
          if (p.sesion_origen_id) {
            const valid = await this.persistence.transitionFindSesionCliente(
              m,
              { sesion_origen_id: p.sesion_origen_id },
            );
            if (!valid.length)
              throw new ConflictException(
                'La sesión invitada de origen ya no está vigente.',
              );
          }
          const active =
            await this.persistence.transitionFindParticipanteNextNext(m, {
              clientId: ref.clientId,
            });
          if (active.length)
            throw new ConflictException(
              'El cliente ya participa en otra mesa.',
            );
          await this.persistence.transitionUpdateParticipante(m, {
            id: id,
            userId: actor.userId,
          });
          await this.persistence.transitionInsertCuentaConsumo(m, {
            clientId: ref.clientId,
            id: id,
            dayId: v.dayId,
          });
        } else {
          if (
            (mode === 'reject' && p.estado !== 'pending') ||
            (mode === 'finish' && p.estado !== 'approved') ||
            (mode === 'leave' && !['pending', 'approved'].includes(p.estado))
          )
            throw new ConflictException(
              'Transición de participación no permitida.',
            );
          const next =
            mode === 'reject'
              ? 'rejected'
              : p.estado === 'pending'
                ? 'cancelled'
                : 'finished';
          await this.rewards.releaseForParticipant(m, id);
          if (next === 'finished')
            await this.assertAccountsEmpty(m, 'participant', id);
          await this.persistence.transitionUpdateParticipanteNext(m, {
            id: id,
            next: next,
            reason: reason ?? null,
          });
          if (next === 'finished')
            await this.persistence.transitionUpdateCuentaConsumo(m, { id: id });
        }
        const response = await this.getParticipant(m, id, client?.clientId);
        await auditTableOperation(
          m,
          actor,
          'participante',
          id,
          `participant.${mode}`,
          { before: p.estado, after: response.status, reason: reason ?? null },
        );
        return { resourceId: id, response };
      },
    );
  }

  private async lockVisit(m: EntityManager, visitId: string) {
    const [ref] = await this.persistence.lockVisitFindVisitaMesa(m, {
      visitId: visitId,
    });
    if (!ref) throw new NotFoundException('Visita no encontrada.');
    await this.persistence.lockVisitFindJornadaOperativa(m, {
      id_jornada: ref.id_jornada,
    });
    await this.persistence.lockVisitFindMesa(m, { id_mesa: ref.id_mesa });
    const [visit] = await this.persistence.lockVisitFindVisitaMesaNext(m, {
      visitId: visitId,
    });
    if (visit.estado !== 'open')
      throw new ConflictException('La visita está cerrada.');
    return ref;
  }

  async close(id: string, actor: TableActor, key?: string) {
    return this.idempotency.run(
      actor,
      `visits/${id.toLowerCase()}/close`,
      key,
      {},
      200,
      'visita_mesa',
      async () => {},
      async (m) => {
        await lockTableOperations(m);
        const ref = await this.lockVisit(m, id);
        const participants = await this.persistence.closeFindParticipante(m, {
          id: id,
        });
        await this.rewards.releaseForVisit(m, id);
        await this.assertAccountsEmpty(m, 'visit', id);
        await this.persistence.closeUpdateCuentaConsumo(m, { id: id });
        await this.persistence.closeUpdateParticipante(m, { id: id });
        const [visit] = await this.persistence.closeUpdateVisitaMesa(m, {
          id: id,
          userId: actor.userId,
        });
        await this.persistence.closeUpdateMesa(m, { id_mesa: ref.id_mesa });
        await auditTableOperation(m, actor, 'visita_mesa', id, 'visit.closed', {
          participants,
        });
        return { resourceId: id, response: visit };
      },
    );
  }

  private async assertAccountsEmpty(
    m: EntityManager,
    filter: 'participant' | 'visit',
    id: string,
  ) {
    const [row] = await this.persistence.assertAccountsEmptyFindParticipante(
      m,
      [id],
      filter,
    );
    if (row)
      throw new ConflictException('La cuenta tiene consumos pendientes.');
  }

  async closeForOperatingDay(
    manager: EntityManager,
    dayId: string,
    actor: TableActor,
  ) {
    const visits = await this.persistence.closeOperatingDayFindVisitaMesa(
      manager,
      { dayId },
    );
    let cancelledParticipants = 0;
    let finishedParticipants = 0;
    for (const visit of visits) {
      await this.rewards.releaseForVisit(manager, visit.id);
      const participants = await this.persistence.closeFindParticipante(
        manager,
        { id: visit.id },
      );
      await this.assertAccountsEmpty(manager, 'visit', visit.id);
      await this.persistence.closeUpdateCuentaConsumo(manager, {
        id: visit.id,
      });
      await this.persistence.closeUpdateParticipante(manager, {
        id: visit.id,
      });
      const [closed] = await this.persistence.closeUpdateVisitaMesa(manager, {
        id: visit.id,
        userId: actor.userId,
      });
      await this.persistence.closeUpdateMesa(manager, {
        id_mesa: visit.tableId,
      });
      cancelledParticipants += participants.filter(
        (participant) => participant.status === 'pending',
      ).length;
      finishedParticipants += participants.filter(
        (participant) => participant.status === 'approved',
      ).length;
      await auditTableOperation(
        manager,
        actor,
        'visita_mesa',
        visit.id,
        'visit.operating_day_closed',
        { operatingDayId: dayId, participants, visit: closed },
      );
    }
    return {
      closedVisits: visits.length,
      cancelledParticipants,
      finishedParticipants,
    };
  }
}
