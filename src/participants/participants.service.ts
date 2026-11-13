import { forEachSequential } from '../common/async/for-each-sequential.js';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountLifecycleService } from '../accounts/account-lifecycle.service.js';
import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { UserSession } from '../auth/entities/user-session.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { type TableActor } from '../common/audit/table-audit.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { type ClientIdentity } from '../common/identity/client-access.guard.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { GuestSession } from '../guest-sessions/entities/guest-session.entity.js';
import { hashAccessSecret } from '../guest-sessions/guest-sessions.service.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { RedemptionReservationsService } from '../redemptions/redemption-reservations.service.js';
import { Role } from '../roles/entities/role.entity.js';
import { RestaurantTable } from '../tables/entities/restaurant-table.entity.js';
import { User } from '../users/entities/user.entity.js';
import { type VisitsQueryDto } from '../visits/dto/visits-query.dto.js';
import { TableVisit } from '../visits/entities/table-visit.entity.js';
import { type ParticipantQueryDto } from './dto/participant-query.dto.js';
import { type RequestParticipationDto } from './dto/request-participation.dto.js';
import { Participant } from './entities/participant.entity.js';
import {
  AssertAccountsEmptyFindParticipanteRow,
  AuthenticateFindClienteRow,
  AuthenticateFindParticipanteRow,
  AuthenticateFindSesionClienteRow,
  CloseFindParticipanteRow,
  CloseOperatingDayFindVisitaMesaRow,
  CloseUpdateVisitaMesaRow,
  GetParticipantFindParticipanteRow,
  LockVisitFindVisitaMesaNextRow,
  LockVisitFindVisitaMesaRow,
  participantColumns,
  ParticipantsFindVisitaMesaRow,
  RequestFindParticipanteRow,
  RequestInsertParticipanteRow,
  TransitionFindParticipanteNextNextRow,
  TransitionFindParticipanteNextRow,
  TransitionFindParticipanteRow,
  TransitionFindSesionClienteRow,
  TransitionFindVisitaMesaRow,
  VisitFindVisitaMesaRow,
} from './types/participants.types.js';

@Injectable()
export class ParticipantsService {
  constructor(
    @InjectRepository(Participant)
    private readonly records: Repository<Participant>,
    private readonly idempotency: ParticipationIdempotencyService,
    private readonly rewards: RedemptionReservationsService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly accountLifecycle: AccountLifecycleService,
  ) {}

  async authenticate(
    manager: EntityManager,
    actor: ClientIdentity,
    participantId?: string,
  ) {
    const rows = actor.guestSessionId
      ? await this.authenticateFindSesionCliente(manager, {
          guestSessionId: actor.guestSessionId,
          clientId: actor.clientId,
        })
      : await this.authenticateFindCliente(manager, {
          clientId: actor.clientId,
          userId: actor.userId,
          userSessionId: actor.userSessionId,
        });
    if (!rows.length) throw new UnauthorizedException('Sesión no válida.');
    if (participantId) {
      const own = await this.authenticateFindParticipante(manager, {
        participantId,
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
      {
        authorize: (m) => this.authenticate(m, actor),
        action: async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const table = await this.operationalContext.lockActiveVisit(
            m,
            visitId,
            zone,
          );
          if (!table.qrHash || table.qrHash !== hashAccessSecret(dto.qrToken))
            throw new NotFoundException('QR vencido o inválido.');
          await this.requestFindCliente(m, {
            clientId: actor.clientId,
          });
          const duplicate = await this.requestFindParticipante(m, {
            visitId,
            clientId: actor.clientId,
          });
          if (duplicate.length)
            throw new ConflictException(
              'Ya existe una participación en esta visita.',
            );
          const [p] = await this.requestInsertParticipante(m, {
            visitId,
            clientId: actor.clientId,
            guestSessionId: actor.guestSessionId ?? null,
            userId: actor.userId ?? null,
            alias: dto.alias,
            qrVersion: table.qrVersion,
          });
          const response = await this.getParticipant(m, p.id);
          await this.auditLog.append(
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
      },
    );
  }

  async getParticipant(manager: EntityManager, id: string, clientId?: string) {
    const [item] = await this.getParticipantFindParticipante(manager, {
      id,
      clientId: clientId ?? null,
    });
    if (!item) throw new NotFoundException('Participación no encontrada.');
    return item;
  }

  detail(id: string, actor: ClientIdentity) {
    return this.getParticipant(this.records.manager, id, actor.clientId);
  }

  async participants(
    query: ParticipantQueryDto,
    filter: { clientId?: string; visitId?: string },
  ) {
    if (filter.visitId) {
      const exists = await this.participantsFindVisitaMesa(
        this.records.manager,
        { visitId: filter.visitId },
      );
      if (!exists.length) throw new NotFoundException('Visita no encontrada.');
    }
    return this.listParticipants(this.records.manager, query, filter);
  }

  async visits(query: VisitsQueryDto) {
    return this.listVisits(this.records.manager, query);
  }

  async visit(id: string) {
    const [row] = await this.visitFindVisitaMesa(this.records.manager, {
      id,
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
      {
        authorize: auth,
        action: async (m) => {
          const zone = await this.operationalContext.lockTableOperations(m);
          const [ref] = await this.transitionFindParticipante(m, {
            id,
          });
          if (!ref) throw new NotFoundException('Participación no encontrada.');
          if (mode === 'approve')
            await this.operationalContext.lockActiveVisit(m, ref.visitId, zone);
          else await this.lockVisit(m, ref.visitId);
          await this.requestFindCliente(m, {
            clientId: ref.clientId,
          });
          const [p] = await this.transitionFindParticipanteNext(m, {
            id,
          });
          if (mode === 'approve')
            await this.approveParticipation(m, { id, p, ref, actor });
          else await this.finishParticipation(m, { id, p, mode, reason });
          const response = await this.getParticipant(m, id, client?.clientId);
          await this.auditLog.append(
            m,
            actor,
            'participante',
            id,
            `participant.${mode}`,
            {
              before: p.estado,
              after: response.status,
              reason: reason ?? null,
            },
          );
          return { resourceId: id, response };
        },
      },
    );
  }

  private async approveParticipation(
    m: EntityManager,
    context: {
      id: string;
      p: TransitionFindParticipanteNextRow;
      ref: TransitionFindParticipanteRow;
      actor: TableActor;
    },
  ) {
    const { id, p, ref, actor } = context;
    if (p.estado !== 'pending')
      throw new ConflictException('La solicitud ya no está pendiente.');
    const [v] = await this.transitionFindVisitaMesa(m, {
      visitId: ref.visitId,
    });
    if (p.qr_version_aprobada !== v.version)
      throw new ConflictException('El QR ha sido renovado.');
    if (p.sesion_origen_id) {
      const valid = await this.transitionFindSesionCliente(m, {
        sesion_origen_id: p.sesion_origen_id,
      });
      if (!valid.length)
        throw new ConflictException(
          'La sesión invitada de origen ya no está vigente.',
        );
    }
    const active = await this.transitionFindParticipanteNextNext(m, {
      clientId: ref.clientId,
    });
    if (active.length)
      throw new ConflictException('El cliente ya participa en otra mesa.');
    await this.transitionUpdateParticipante(m, {
      id,
      userId: actor.userId,
    });
    await this.transitionInsertCuentaConsumo(m, {
      clientId: ref.clientId,
      id,
      dayId: v.dayId,
    });
  }
  private async finishParticipation(
    m: EntityManager,
    context: {
      id: string;
      p: TransitionFindParticipanteNextRow;
      mode: 'reject' | 'finish' | 'leave';
      reason?: string;
    },
  ) {
    const { id, p, mode, reason } = context;
    if (
      (mode === 'reject' && p.estado !== 'pending') ||
      (mode === 'finish' && p.estado !== 'approved') ||
      (mode === 'leave' && !['pending', 'approved'].includes(p.estado))
    )
      throw new ConflictException('Transición de participación no permitida.');
    let next: 'cancelled' | 'finished' | 'rejected' =
      p.estado === 'pending' ? 'cancelled' : 'finished';
    if (mode === 'reject') next = 'rejected';
    await this.rewards.releaseForParticipant(m, id);
    if (next === 'finished')
      await this.assertAccountsEmpty(m, 'participant', id);
    await this.accountLifecycle.resolveParticipant(m, {
      id,
      next,
      reason: reason ?? null,
    });
    if (next === 'finished')
      await this.accountLifecycle.closeParticipantAccount(m, {
        id,
      });
  }
  private async lockVisit(m: EntityManager, visitId: string) {
    const [ref] = await this.lockVisitFindVisitaMesa(m, {
      visitId,
    });
    if (!ref) throw new NotFoundException('Visita no encontrada.');
    await this.lockVisitFindJornadaOperativa(m, {
      id_jornada: ref.id_jornada,
    });
    await this.lockVisitFindMesa(m, { id_mesa: ref.id_mesa });
    const [visit] = await this.lockVisitFindVisitaMesaNext(m, {
      visitId,
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
      {
        authorize: async () => {},
        action: async (m) => {
          await this.operationalContext.lockTableOperations(m);
          const ref = await this.lockVisit(m, id);
          const participants = await this.closeFindParticipante(m, {
            id,
          });
          await this.rewards.releaseForVisit(m, id);
          await this.assertAccountsEmpty(m, 'visit', id);
          await this.accountLifecycle.closeVisitAccounts(m, { id });
          await this.accountLifecycle.finishVisitParticipants(m, { id });
          const [visit] = await this.closeUpdateVisitaMesa(m, {
            id,
            userId: actor.userId,
          });
          await this.closeUpdateMesa(m, { id_mesa: ref.id_mesa });
          await this.auditLog.append(
            m,
            actor,
            'visita_mesa',
            id,
            'visit.closed',
            {
              participants,
            },
          );
          return { resourceId: id, response: visit };
        },
      },
    );
  }

  private async assertAccountsEmpty(
    m: EntityManager,
    filter: 'participant' | 'visit',
    id: string,
  ) {
    const [row] = await this.assertAccountsEmptyFindParticipante(
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
    const visits = await this.closeOperatingDayFindVisitaMesa(manager, {
      dayId,
    });
    let cancelledParticipants = 0;
    let finishedParticipants = 0;
    await forEachSequential(visits, async (visit) => {
      await this.rewards.releaseForVisit(manager, visit.id);
      const participants = await this.closeFindParticipante(manager, {
        id: visit.id,
      });
      await this.assertAccountsEmpty(manager, 'visit', visit.id);
      await this.accountLifecycle.closeVisitAccounts(manager, {
        id: visit.id,
      });
      await this.accountLifecycle.finishVisitParticipants(manager, {
        id: visit.id,
      });
      const [closed] = await this.closeUpdateVisitaMesa(manager, {
        id: visit.id,
        userId: actor.userId,
      });
      await this.closeUpdateMesa(manager, {
        id_mesa: visit.tableId,
      });
      cancelledParticipants += participants.filter(
        (participant) => participant.status === 'pending',
      ).length;
      finishedParticipants += participants.filter(
        (participant) => participant.status === 'approved',
      ).length;
      await this.auditLog.append(
        manager,
        actor,
        'visita_mesa',
        visit.id,
        'visit.operating_day_closed',
        { operatingDayId: dayId, participants, visit: closed },
      );
    });
    return {
      closedVisits: visits.length,
      cancelledParticipants,
      finishedParticipants,
    };
  }

  private closeOperatingDayFindVisitaMesa(
    manager: EntityManager,
    input: { dayId: string },
  ): Promise<CloseOperatingDayFindVisitaMesaRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder('v')
      .select(['v.id_visita AS id', 'v.id_mesa AS "tableId"'])
      .where("v.id_jornada=:dayId AND v.estado='open'")
      .addOrderBy('v.id_mesa', 'ASC')
      .addOrderBy('v.id_visita', 'ASC')
      .setParameters({ dayId: input.dayId })
      .getRawMany<CloseOperatingDayFindVisitaMesaRow>();
  }

  private authenticateFindSesionCliente(
    manager: EntityManager,
    input: { guestSessionId: string; clientId: string },
  ): Promise<AuthenticateFindSesionClienteRow[]> {
    return manager
      .getRepository(GuestSession)
      .createQueryBuilder('sesion_cliente')
      .select('1 AS "1"')
      .where(
        '"id_sesion_cliente"=:guestSessionId AND "id_cliente"=:clientId AND "revocada_en" IS NULL AND "expira_en">clock_timestamp()',
      )
      .setLock('pessimistic_read', undefined, undefined)
      .setParameters({
        guestSessionId: input.guestSessionId,
        clientId: input.clientId,
      })
      .getRawMany<AuthenticateFindSesionClienteRow>();
  }

  private authenticateFindCliente(
    manager: EntityManager,
    input: {
      clientId: string;
      userId: string | undefined;
      userSessionId: string | undefined;
    },
  ): Promise<AuthenticateFindClienteRow[]> {
    return manager
      .getRepository(Client)
      .createQueryBuilder('c')
      .select('1 AS "1"')
      .innerJoin(User, 'u', 'u."id_usuario"=c."id_usuario"')
      .innerJoin(Role, 'r', 'r."id_rol"=u."id_rol"')
      .innerJoin(UserSession, 's', 's."id_usuario"=u."id_usuario"')
      .where(
        'c."id_cliente"=:clientId AND u."id_usuario"=:userId AND u."activo" AND r."codigo"=\'client\' AND s."id_sesion_usuario"=:userSessionId AND s."revocada_en" IS NULL AND s."expira_en">clock_timestamp()',
      )
      .setLock('pessimistic_read', undefined, ['u', 's'])
      .setParameters({
        clientId: input.clientId,
        userId: input.userId,
        userSessionId: input.userSessionId,
      })
      .getRawMany<AuthenticateFindClienteRow>();
  }

  private authenticateFindParticipante(
    manager: EntityManager,
    input: { participantId: string; clientId: string },
  ): Promise<AuthenticateFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select('1 AS "1"')
      .where('"id_participante"=:participantId AND "id_cliente"=:clientId')
      .setParameters({
        participantId: input.participantId,
        clientId: input.clientId,
      })
      .getRawMany<AuthenticateFindParticipanteRow>();
  }

  private async requestFindCliente(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<void> {
    await manager
      .getRepository(Client)
      .createQueryBuilder('cliente')
      .select('"id_cliente" AS "id_cliente"')
      .where('"id_cliente"=:clientId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ clientId: input.clientId })
      .getRawMany();
  }

  private requestFindParticipante(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<RequestFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select('1 AS "1"')
      .where('"id_visita"=:visitId AND "id_cliente"=:clientId')
      .setParameters({ visitId: input.visitId, clientId: input.clientId })
      .getRawMany<RequestFindParticipanteRow>();
  }

  private requestInsertParticipante(
    manager: EntityManager,
    input: {
      visitId: string;
      clientId: string;
      guestSessionId: string | null;
      userId: string | null;
      alias: string;
      qrVersion: number;
    },
  ): Promise<RequestInsertParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_visita: input.visitId,
          id_cliente: input.clientId,
          sesion_origen_id: input.guestSessionId,
          solicitada_desde: input.userId,
          alias: input.alias,
          qr_version_aprobada: input.qrVersion,
        },
      ])
      .returning('"id_participante" AS id')
      .execute()
      .then((result) => result.raw);
  }

  private getParticipantFindParticipante(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<GetParticipantFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('p')
      .select(
        ('' + String(participantColumns) + '').replace(/\$(\d+)/g, ':p$1'),
      )
      .leftJoin(
        ConsumptionAccount,
        'c',
        'c."id_participante"=p."id_participante"',
      )
      .where(
        'p."id_participante"=:id AND (:clientId::uuid IS NULL OR p."id_cliente"=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<GetParticipantFindParticipanteRow>();
  }

  private participantsFindVisitaMesa(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<ParticipantsFindVisitaMesaRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select('1 AS "1"')
      .where('"id_visita"=:visitId')
      .setParameters({ visitId: input.visitId })
      .getRawMany<ParticipantsFindVisitaMesaRow>();
  }

  private visitFindVisitaMesa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<VisitFindVisitaMesaRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select([
        '"id_visita" AS id',
        '"id_mesa" AS "tableId"',
        '"id_jornada" AS "operatingDayId"',
        '"estado" AS status',
        '"abierta_en" AS "openedAt"',
        '"cerrada_en" AS "closedAt"',
        '"abierta_por" AS "openedBy"',
        '"cerrada_por" AS "closedBy"',
      ])
      .where('"id_visita"=:id')
      .setParameters({ id: input.id })
      .getRawMany<VisitFindVisitaMesaRow>();
  }

  private transitionFindParticipante(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select(['"id_visita" AS "visitId"', '"id_cliente" AS "clientId"'])
      .where('"id_participante"=:id')
      .setParameters({ id: input.id })
      .getRawMany<TransitionFindParticipanteRow>();
  }

  private transitionFindParticipanteNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindParticipanteNextRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select([
        '"participante"."aprobada_por" AS "aprobada_por"',
        '"participante"."estado" AS "estado"',
        '"participante"."alias" AS "alias"',
        '"participante"."qr_version_aprobada" AS "qr_version_aprobada"',
        '"participante"."id_cliente" AS "id_cliente"',
        '"participante"."id_participante" AS "id_participante"',
        '"participante"."sesion_origen_id" AS "sesion_origen_id"',
        '"participante"."id_visita" AS "id_visita"',
        '"participante"."finalizada_en" AS "finalizada_en"',
        '"participante"."solicitada_en" AS "solicitada_en"',
        '"participante"."aprobada_en" AS "aprobada_en"',
        '"participante"."solicitada_desde" AS "solicitada_desde"',
        '"participante"."motivo_rechazo" AS "motivo_rechazo"',
      ])
      .where('"id_participante"=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<TransitionFindParticipanteNextRow>();
  }

  private transitionFindVisitaMesa(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<TransitionFindVisitaMesaRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder('v')
      .select(['v."id_jornada" AS "dayId"', 'm."qr_version" AS version'])
      .innerJoin(RestaurantTable, 'm', 'm."id_mesa"=v."id_mesa"')
      .where('v."id_visita"=:visitId')
      .setParameters({ visitId: input.visitId })
      .getRawMany<TransitionFindVisitaMesaRow>();
  }

  private transitionFindSesionCliente(
    manager: EntityManager,
    input: { sesion_origen_id: string },
  ): Promise<TransitionFindSesionClienteRow[]> {
    return manager
      .getRepository(GuestSession)
      .createQueryBuilder('sesion_cliente')
      .select('1 AS "1"')
      .where(
        '"id_sesion_cliente"=:sesion_origen_id AND "revocada_en" IS NULL AND "expira_en">clock_timestamp()',
      )
      .setLock('pessimistic_read', undefined, undefined)
      .setParameters({ sesion_origen_id: input.sesion_origen_id })
      .getRawMany<TransitionFindSesionClienteRow>();
  }

  private transitionFindParticipanteNextNext(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<TransitionFindParticipanteNextNextRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select('1 AS "1"')
      .where('"id_cliente"=:clientId AND "estado"=\'approved\'')
      .setParameters({ clientId: input.clientId })
      .getRawMany<TransitionFindParticipanteNextNextRow>();
  }

  private async transitionUpdateParticipante(
    manager: EntityManager,
    input: { id: string; userId: string | undefined },
  ): Promise<void> {
    await manager
      .getRepository(Participant)
      .createQueryBuilder()
      .update(Participant)
      .set({
        estado: 'approved',
        aprobada_por: input.userId,
        aprobada_en: () => 'clock_timestamp()',
      })
      .where('"id_participante"=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async transitionInsertCuentaConsumo(
    manager: EntityManager,
    input: { clientId: string; id: string; dayId: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.clientId,
          id_participante: input.id,
          id_jornada: input.dayId,
        },
      ])
      .execute();
  }

  private lockVisitFindVisitaMesa(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<LockVisitFindVisitaMesaRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select('"id_jornada", "id_mesa"')
      .where('"id_visita"=:visitId')
      .setParameters({ visitId: input.visitId })
      .getRawMany<LockVisitFindVisitaMesaRow>();
  }

  private async lockVisitFindJornadaOperativa(
    manager: EntityManager,
    input: { id_jornada: string },
  ): Promise<void> {
    await manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('1 AS "1"')
      .where('"id_jornada"=:id_jornada')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_jornada: input.id_jornada })
      .getRawMany();
  }

  private async lockVisitFindMesa(
    manager: EntityManager,
    input: { id_mesa: string },
  ): Promise<void> {
    await manager
      .getRepository(RestaurantTable)
      .createQueryBuilder('mesa')
      .select('1 AS "1"')
      .where('"id_mesa"=:id_mesa')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id_mesa: input.id_mesa })
      .getRawMany();
  }

  private lockVisitFindVisitaMesaNext(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<LockVisitFindVisitaMesaNextRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select('"estado" AS "estado"')
      .where('"id_visita"=:visitId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ visitId: input.visitId })
      .getRawMany<LockVisitFindVisitaMesaNextRow>();
  }

  private closeFindParticipante(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CloseFindParticipanteRow[]> {
    return manager
      .getRepository(Participant)
      .createQueryBuilder('participante')
      .select(['"id_participante" AS id', '"estado" AS status'])
      .where('"id_visita"=:id AND "estado" IN (\'pending\',\'approved\')')
      .addOrderBy('"id_cliente"', 'ASC')
      .addOrderBy('"id_participante"', 'ASC')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<CloseFindParticipanteRow>();
  }

  private async closeUpdateVisitaMesa(
    manager: EntityManager,
    input: { id: string; userId: string | undefined },
  ): Promise<CloseUpdateVisitaMesaRow[]> {
    const rows = await manager
      .getRepository(TableVisit)
      .createQueryBuilder()
      .update(TableVisit)
      .set({
        estado: 'closed',
        cerrada_en: () => 'clock_timestamp()',
        cerrada_por: input.userId,
      })
      .where('"id_visita"=:id')
      .returning(
        '"id_visita" AS id,"estado" AS status,"cerrada_en" AS "closedAt"',
      )
      .setParameters({ id: input.id })
      .execute()
      .then((result) => result.raw);
    return rows;
  }

  private async closeUpdateMesa(
    manager: EntityManager,
    input: { id_mesa: string },
  ): Promise<void> {
    await manager
      .getRepository(RestaurantTable)
      .createQueryBuilder()
      .update(RestaurantTable)
      .set({ qr_hash: null })
      .where('"id_mesa"=:id_mesa')
      .setParameters({ id_mesa: input.id_mesa })
      .execute();
  }

  private assertAccountsEmptyFindParticipante(
    manager: EntityManager,
    parameters: unknown[],
    scope: 'participant' | 'visit',
  ): Promise<AssertAccountsEmptyFindParticipanteRow[]> {
    const queryValues1: unknown[] = parameters;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    return manager
      .getRepository(Participant)
      .createQueryBuilder('p')
      .select('1 AS "1"')
      .innerJoin(ConsumptionAccount, 'c', 'c.id_participante=p.id_participante')
      .where(
        (
          '' +
          String(
            scope === 'participant'
              ? 'p."id_participante"=$1'
              : 'p."id_visita"=$1',
          ) +
          " AND (EXISTS (SELECT 1 FROM asignacion_consumo a WHERE a.id_cuenta=c.id_cuenta AND a.estado='active' AND NOT EXISTS (SELECT 1 FROM detalle_liquidacion dl JOIN liquidacion l ON l.id_liquidacion=dl.id_liquidacion WHERE dl.id_asignacion=a.id_asignacion AND dl.vigente AND l.estado='settled')) OR EXISTS (SELECT 1 FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido JOIN detalle_pedido d ON d.id_version=v.id_version JOIN reserva_inventario r ON r.id_detalle=d.id_detalle WHERE o.id_cuenta=c.id_cuenta AND r.estado='active'))"
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .limit(1)
      .setParameters(queryParameters1)
      .getRawMany<AssertAccountsEmptyFindParticipanteRow>();
  }

  private async listVisits(manager: EntityManager, query: VisitsQueryDto) {
    const args = [
      query.tableId ?? null,
      query.operatingDayId ?? null,
      query.status ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(TableVisit)
      .createQueryBuilder('v')
      .select('count(*)::int AS total')
      .where(
        '(:p1::uuid IS NULL OR v."id_mesa"=:p1) AND (:p2::uuid IS NULL OR v."id_jornada"=:p2) AND (:p3::text IS NULL OR v."estado"=:p3)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [
      ...args,
      query.limit,
      (query.page - 1) * query.limit,
    ];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(TableVisit)
      .createQueryBuilder('v')
      .select([
        'v."id_visita" AS id',
        'v."id_mesa" AS "tableId"',
        'v."id_jornada" AS "operatingDayId"',
        'v."estado" AS status',
        'v."abierta_en" AS "openedAt"',
        'v."cerrada_en" AS "closedAt"',
        'v."abierta_por" AS "openedBy"',
        'v."cerrada_por" AS "closedBy"',
      ])
      .where(
        '(:p1::uuid IS NULL OR v."id_mesa"=:p1) AND (:p2::uuid IS NULL OR v."id_jornada"=:p2) AND (:p3::text IS NULL OR v."estado"=:p3)',
      )
      .addOrderBy('v."abierta_en"', 'DESC')
      .addOrderBy('v."id_visita"', 'DESC')
      .limit(Number(queryValues2[3]))
      .offset(Number(queryValues2[4]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total, page: query.page, limit: query.limit };
  }

  private async listParticipants(
    manager: EntityManager,
    query: ParticipantQueryDto,
    filter: { clientId?: string; visitId?: string },
  ) {
    const args = [
      filter.clientId ?? null,
      filter.visitId ?? null,
      query.status ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(Participant)
      .createQueryBuilder('p')
      .select('count(*)::int AS total')
      .where(
        '(:p1::uuid IS NULL OR p."id_cliente"=:p1) AND (:p2::uuid IS NULL OR p."id_visita"=:p2) AND (:p3::text IS NULL OR p."estado"=:p3)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [
      ...args,
      query.limit,
      (query.page - 1) * query.limit,
    ];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(Participant)
      .createQueryBuilder('p')
      .select(
        'p."id_participante" AS id, p."id_visita" AS "visitId", p."id_cliente" AS "clientId", p."alias", p."estado" AS status, p."qr_version_aprobada" AS "requestedQrVersion", p."solicitada_en" AS "requestedAt", p."aprobada_en" AS "approvedAt", p."finalizada_en" AS "finishedAt", p."motivo_rechazo" AS "rejectionReason", CASE WHEN c."id_cuenta" IS NULL THEN NULL ELSE json_build_object(\'id\',c."id_cuenta",\'status\',c."estado",\'modality\',c."modalidad",\'createdAt\',c."creada_en",\'closedAt\',c."cerrada_en") END AS account',
      )
      .leftJoin(
        ConsumptionAccount,
        'c',
        'c."id_participante"=p."id_participante"',
      )
      .where(
        '(:p1::uuid IS NULL OR p."id_cliente"=:p1) AND (:p2::uuid IS NULL OR p."id_visita"=:p2) AND (:p3::text IS NULL OR p."estado"=:p3)',
      )
      .addOrderBy('p."solicitada_en"', 'DESC')
      .addOrderBy('p."id_participante"', 'DESC')
      .limit(Number(queryValues2[3]))
      .offset(Number(queryValues2[4]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total, page: query.page, limit: query.limit };
  }
}
