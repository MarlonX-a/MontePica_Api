import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../common/audit/audit.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { hashAccessSecret } from '../guest-sessions/guest-sessions.service.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { RestaurantTable } from '../tables/entities/restaurant-table.entity.js';
import {
  IssueQrUpdateMesaRow,
  IssueQrUpdateParticipanteRow,
  OpenVisitFindJornadaOperativaNextRow,
  OpenVisitFindJornadaOperativaRow,
  OpenVisitFindMesaRow,
  OpenVisitFindVisitaMesaRow,
  OpenVisitInsertVisitaMesaRow,
} from '../tables/types/tables.types.js';
import { TableVisit } from './entities/table-visit.entity.js';

@Injectable()
export class VisitsService {
  constructor(
    private readonly db: DataSource,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
  ) {}

  openVisit(tableId: string, actor: string) {
    return this.db.transaction(async (manager) => {
      const timeZone =
        await this.operationalContext.lockTableOperations(manager);
      const [day] = await this.openVisitFindJornadaOperativa(manager, {
        timeZone,
      });
      if (!day) throw new ConflictException('No hay jornada abierta para hoy.');
      const [table] = await this.openVisitFindMesa(manager, {
        tableId,
      });
      if (!table) throw new NotFoundException('Mesa no encontrada.');
      if (!table.active) throw new ConflictException('Mesa inactiva.');
      const [{ current }] = await this.openVisitFindJornadaOperativaNext(
        manager,
        {
          id: day.id,
          timeZone,
        },
      );
      if (!current)
        throw new ConflictException(
          'Cambió la fecha operativa; abre la jornada actual.',
        );
      const existing = await this.openVisitFindVisitaMesa(manager, {
        tableId,
      });
      if (existing.length)
        throw new ConflictException('La mesa ya tiene una visita abierta.');
      const [visit] = await this.openVisitInsertVisitaMesa(manager, {
        tableId,
        id: day.id,
        actor,
      });
      await this.openVisitUpdateMesa(manager, { tableId });
      await this.auditLog.append(
        manager,
        { userId: actor },
        'visita_mesa',
        visit.id,
        'visit.opened',
        { tableId, operatingDayId: day.id },
      );
      return visit;
    });
  }

  issueQr(visitId: string, actor: string) {
    return this.db.transaction(async (manager) => {
      const timeZone =
        await this.operationalContext.lockTableOperations(manager);
      const table = await this.operationalContext.lockActiveVisit(
        manager,
        visitId,
        timeZone,
      );
      const token = randomBytes(32).toString('base64url');
      const [row] = await this.issueQrUpdateMesa(manager, {
        id: table.id,
        token: hashAccessSecret(token),
      });
      const cancelled = await this.issueQrUpdateParticipante(manager, {
        visitId,
      });
      await this.auditLog.append(
        manager,
        { userId: actor },
        'visita_mesa',
        visitId,
        'visit.qr_issued',
        {
          tableId: table.id,
          qrVersion: row.qrVersion,
          cancelledParticipantIds: cancelled.map((p: { id: string }) => p.id),
        },
      );
      return { visitId, qrToken: token, qrVersion: row.qrVersion };
    });
  }

  private openVisitFindJornadaOperativa(
    manager: EntityManager,
    input: { timeZone: string },
  ): Promise<OpenVisitFindJornadaOperativaRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select('"id_jornada" AS id')
      .where(
        '"fecha_operativa"=timezone(:timeZone,clock_timestamp())::date AND "estado"=\'open\'',
      )
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ timeZone: input.timeZone })
      .getRawMany<OpenVisitFindJornadaOperativaRow>();
  }

  private openVisitFindMesa(
    manager: EntityManager,
    input: { tableId: string },
  ): Promise<OpenVisitFindMesaRow[]> {
    return manager
      .getRepository(RestaurantTable)
      .createQueryBuilder('mesa')
      .select('"activa" AS active')
      .where('"id_mesa"=:tableId')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ tableId: input.tableId })
      .getRawMany<OpenVisitFindMesaRow>();
  }

  private openVisitFindJornadaOperativaNext(
    manager: EntityManager,
    input: { id: string; timeZone: string },
  ): Promise<OpenVisitFindJornadaOperativaNextRow[]> {
    return manager
      .getRepository(OperatingDay)
      .createQueryBuilder('jornada_operativa')
      .select(
        '"fecha_operativa"=timezone(:timeZone,clock_timestamp())::date AS current',
      )
      .where('"id_jornada"=:id')
      .setParameters({ id: input.id, timeZone: input.timeZone })
      .getRawMany<OpenVisitFindJornadaOperativaNextRow>();
  }

  private openVisitFindVisitaMesa(
    manager: EntityManager,
    input: { tableId: string },
  ): Promise<OpenVisitFindVisitaMesaRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select('"id_visita" AS "id_visita"')
      .where('"id_mesa"=:tableId AND "estado"=\'open\'')
      .setParameters({ tableId: input.tableId })
      .getRawMany<OpenVisitFindVisitaMesaRow>();
  }

  private openVisitInsertVisitaMesa(
    manager: EntityManager,
    input: { tableId: string; id: string; actor: string },
  ): Promise<OpenVisitInsertVisitaMesaRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_mesa: input.tableId,
          id_jornada: input.id,
          abierta_por: input.actor,
        },
      ])
      .returning(
        '"id_visita" AS id,"estado" AS status,"abierta_en" AS "openedAt"',
      )
      .execute()
      .then((result) => result.raw);
  }

  private async openVisitUpdateMesa(
    manager: EntityManager,
    input: { tableId: string },
  ): Promise<void> {
    await manager
      .getRepository(RestaurantTable)
      .createQueryBuilder()
      .update(RestaurantTable)
      .set({ qr_hash: null })
      .where('"id_mesa"=:tableId')
      .setParameters({ tableId: input.tableId })
      .execute();
  }

  private async issueQrUpdateMesa(
    manager: EntityManager,
    input: { id: string; token: string },
  ): Promise<IssueQrUpdateMesaRow[]> {
    const rows = await manager
      .getRepository(RestaurantTable)
      .createQueryBuilder()
      .update(RestaurantTable)
      .set({ qr_hash: input.token, qr_version: () => '"qr_version"+1' })
      .where('"id_mesa"=:id')
      .returning('"qr_version" AS "qrVersion"')
      .setParameters({ id: input.id })
      .execute()
      .then((result) => result.raw);
    return rows;
  }

  private async issueQrUpdateParticipante(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<IssueQrUpdateParticipanteRow[]> {
    const rows = await manager
      .getRepository(Participant)
      .createQueryBuilder()
      .update(Participant)
      .set({ estado: 'cancelled', finalizada_en: () => 'clock_timestamp()' })
      .where('"id_visita"=:visitId AND "estado"=\'pending\'')
      .returning('"id_participante" AS id')
      .setParameters({ visitId: input.visitId })
      .execute()
      .then((result) => result.raw);
    return rows;
  }
}
