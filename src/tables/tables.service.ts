import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { TableVisit } from '../visits/entities/table-visit.entity.js';
import { type UpdateTableDto } from './dto/update-table.dto.js';
import { RestaurantTable } from './entities/restaurant-table.entity.js';
import {
  CreateTableInsertMesaRow,
  TableFindMesaRow,
  TablesFindMesaNextRow,
  TablesFindMesaRow,
  UpdateTableFindMesaRow,
  UpdateTableFindVisitaMesaRow,
  UpdateTableUpdateMesaRow,
} from './types/tables.types.js';

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(RestaurantTable)
    private readonly records: Repository<RestaurantTable>,
    private readonly db: DataSource,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
  ) {}

  async createTable(code: string, actor: string) {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length > 40)
      throw new BadRequestException(
        'El código normalizado no puede exceder 40 caracteres.',
      );
    try {
      return await this.db.transaction(async (manager) => {
        const [table] = await this.createTableInsertMesa(manager, {
          normalizedCode,
        });
        await this.auditLog.append(
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
    const items = await this.tablesFindMesa(this.records.manager, {
      limit,
      offset: (page - 1) * limit,
    });
    const [{ total }] = await this.tablesFindMesaNext(this.records.manager);
    return { items, total, page, limit };
  }

  async table(id: string) {
    const [table] = await this.tableFindMesa(this.records.manager, {
      id,
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
        await this.operationalContext.lockTableOperations(m);
        const [before] = await this.updateTableFindMesa(m, {
          id,
        });
        if (!before) throw new NotFoundException('Mesa no encontrada.');
        if (dto.active === false) {
          const visits = await this.updateTableFindVisitaMesa(m, {
            id,
          });
          if (visits.length)
            throw new ConflictException(
              'No se puede desactivar una mesa con visita abierta.',
            );
        }
        const [after] = await this.updateTableUpdateMesa(m, {
          id,
          code: dto.code?.toUpperCase() ?? before.code,
          active: dto.active ?? before.active,
        });
        await this.auditLog.append(
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

  private createTableInsertMesa(
    manager: EntityManager,
    input: { normalizedCode: string },
  ): Promise<CreateTableInsertMesaRow[]> {
    return manager
      .getRepository(RestaurantTable)
      .createQueryBuilder()
      .insert()
      .values([{ codigo: input.normalizedCode }])
      .returning('"id_mesa" AS id,"codigo" AS code,"activa" AS active')
      .execute()
      .then((result) => result.raw);
  }

  private tablesFindMesa(
    manager: EntityManager,
    input: { limit: number; offset: number },
  ): Promise<TablesFindMesaRow[]> {
    return manager
      .getRepository(RestaurantTable)
      .createQueryBuilder('m')
      .select([
        'm."id_mesa" AS id',
        'm."codigo" AS code',
        'm."activa" AS active',
        'v."id_visita" AS "openVisitId"',
      ])
      .leftJoin(
        TableVisit,
        'v',
        'v."id_mesa"=m."id_mesa" AND v."estado"=\'open\'',
      )
      .addOrderBy('m."codigo"', 'ASC')
      .addOrderBy('m."id_mesa"', 'ASC')
      .limit(Number(input.limit))
      .offset(Number(input.offset))
      .getRawMany<TablesFindMesaRow>();
  }

  private tablesFindMesaNext(
    manager: EntityManager,
  ): Promise<TablesFindMesaNextRow[]> {
    return manager
      .getRepository(RestaurantTable)
      .createQueryBuilder('mesa')
      .select('count(*)::int AS total')
      .getRawMany<TablesFindMesaNextRow>();
  }

  private tableFindMesa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TableFindMesaRow[]> {
    return manager
      .getRepository(RestaurantTable)
      .createQueryBuilder('m')
      .select([
        'm."id_mesa" AS id',
        'm."codigo" AS code',
        'm."activa" AS active',
        'v."id_visita" AS "openVisitId"',
      ])
      .leftJoin(
        TableVisit,
        'v',
        'v."id_mesa"=m."id_mesa" AND v."estado"=\'open\'',
      )
      .where('m."id_mesa"=:id')
      .setParameters({ id: input.id })
      .getRawMany<TableFindMesaRow>();
  }

  private updateTableFindMesa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UpdateTableFindMesaRow[]> {
    return manager
      .getRepository(RestaurantTable)
      .createQueryBuilder('mesa')
      .select(['"id_mesa" AS id', '"codigo" AS code', '"activa" AS active'])
      .where('"id_mesa"=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<UpdateTableFindMesaRow>();
  }

  private updateTableFindVisitaMesa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UpdateTableFindVisitaMesaRow[]> {
    return manager
      .getRepository(TableVisit)
      .createQueryBuilder('visita_mesa')
      .select('1 AS "1"')
      .where('"id_mesa"=:id AND "estado"=\'open\'')
      .setParameters({ id: input.id })
      .getRawMany<UpdateTableFindVisitaMesaRow>();
  }

  private async updateTableUpdateMesa(
    manager: EntityManager,
    input: { id: string; code: string; active: boolean },
  ): Promise<UpdateTableUpdateMesaRow[]> {
    const rows = await manager
      .getRepository(RestaurantTable)
      .createQueryBuilder()
      .update(RestaurantTable)
      .set({ codigo: input.code, activa: input.active })
      .where('"id_mesa"=:id')
      .returning('"id_mesa" AS id,"codigo" AS code,"activa" AS active')
      .setParameters({ id: input.id })
      .execute()
      .then((result) => result.raw);
    return rows;
  }
}
