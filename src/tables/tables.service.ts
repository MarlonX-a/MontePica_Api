import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { UpdateTableDto } from './dto/participation.dto.js';
import { hashAccessSecret } from './guest-sessions.service.js';
import { TablesRepository } from './repositories/tables.repository.js';
import { auditTableOperation } from './table-audit.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

@Injectable()
export class TablesService {
  constructor(
    private readonly db: DataSource,
    private readonly persistence: TablesRepository = new TablesRepository(),
  ) {}

  async createTable(code: string, actor: string) {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length > 40)
      throw new BadRequestException(
        'El código normalizado no puede exceder 40 caracteres.',
      );
    try {
      return await this.db.transaction(async (manager) => {
        const [table] = await this.persistence.createTableInsertMesa(manager, {
          normalizedCode: normalizedCode,
        });
        await auditTableOperation(
          manager,
          { userId: actor },
          'mesa',
          table.id,
          'table.created',
          table,
        );
        return table;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('El código ya existe.');
      throw error;
    }
  }

  async tables(page = 1, limit = 20) {
    const items = await this.persistence.tablesFindMesa(this.db.manager, {
      limit: limit,
      offset: (page - 1) * limit,
    });
    const [{ total }] = await this.persistence.tablesFindMesaNext(
      this.db.manager,
    );
    return { items, total, page, limit };
  }

  async table(id: string) {
    const [table] = await this.persistence.tableFindMesa(this.db.manager, {
      id: id,
    });
    if (!table) throw new NotFoundException('Mesa no encontrada.');
    return table;
  }

  async updateTable(id: string, dto: UpdateTableDto, actor: string) {
    if (dto.code === undefined && dto.active === undefined)
      throw new BadRequestException('Envía al menos un campo.');
    if (dto.code !== undefined && dto.code.toUpperCase().length > 40)
      throw new BadRequestException(
        'El código normalizado no puede exceder 40 caracteres.',
      );
    try {
      return await this.db.transaction(async (m) => {
        await lockTableOperations(m);
        const [before] = await this.persistence.updateTableFindMesa(m, {
          id: id,
        });
        if (!before) throw new NotFoundException('Mesa no encontrada.');
        if (dto.active === false) {
          const visits = await this.persistence.updateTableFindVisitaMesa(m, {
            id: id,
          });
          if (visits.length)
            throw new ConflictException(
              'No se puede desactivar una mesa con visita abierta.',
            );
        }
        const [after] = await this.persistence.updateTableUpdateMesa(m, {
          id: id,
          code: dto.code?.toUpperCase() ?? before.code,
          active: dto.active ?? before.active,
        });
        await auditTableOperation(
          m,
          { userId: actor },
          'mesa',
          id,
          'table.updated',
          { before, after },
        );
        return after;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('El código ya existe.');
      throw error;
    }
  }

  async openVisit(tableId: string, actor: string) {
    return this.db.transaction(async (manager) => {
      const timeZone = await lockTableOperations(manager);
      const [day] = await this.persistence.openVisitFindJornadaOperativa(
        manager,
        { timeZone: timeZone },
      );
      if (!day) throw new ConflictException('No hay jornada abierta para hoy.');
      const [table] = await this.persistence.openVisitFindMesa(manager, {
        tableId: tableId,
      });
      if (!table) throw new NotFoundException('Mesa no encontrada.');
      if (!table.active) throw new ConflictException('Mesa inactiva.');
      const [{ current }] =
        await this.persistence.openVisitFindJornadaOperativaNext(manager, {
          id: day.id,
          timeZone: timeZone,
        });
      if (!current)
        throw new ConflictException(
          'Cambió la fecha operativa; abre la jornada actual.',
        );
      const existing = await this.persistence.openVisitFindVisitaMesa(manager, {
        tableId: tableId,
      });
      if (existing.length)
        throw new ConflictException('La mesa ya tiene una visita abierta.');
      const [visit] = await this.persistence.openVisitInsertVisitaMesa(
        manager,
        { tableId: tableId, id: day.id, actor: actor },
      );
      await this.persistence.openVisitUpdateMesa(manager, { tableId: tableId });
      await auditTableOperation(
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

  async issueQr(visitId: string, actor: string) {
    return this.db.transaction(async (manager) => {
      const timeZone = await lockTableOperations(manager);
      const table = await lockActiveVisit(manager, visitId, timeZone);
      const token = randomBytes(32).toString('base64url');
      const [row] = await this.persistence.issueQrUpdateMesa(manager, {
        id: table.id,
        token: hashAccessSecret(token),
      });
      const cancelled = await this.persistence.issueQrUpdateParticipante(
        manager,
        { visitId: visitId },
      );
      await auditTableOperation(
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
}
