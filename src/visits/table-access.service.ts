import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { hashAccessSecret } from '../guest-sessions/guest-sessions.service.js';
import { RestaurantTable } from '../tables/entities/restaurant-table.entity.js';
import { TableVisit } from './entities/table-visit.entity.js';
import { ResolveQrFindMesaRow } from './types/table-access.types.js';

@Injectable()
export class TableAccessService {
  constructor(
    private readonly db: DataSource,
    private readonly operationalContext: OperationalContextService,
  ) {}

  resolveQr(token: string) {
    return this.db.transaction(async (manager) => {
      const timeZone =
        await this.operationalContext.lockTableOperations(manager);
      const hash = hashAccessSecret(token);
      const [visit] = await this.resolveQrFindMesa(manager, {
        hash,
      });
      if (!visit) throw new NotFoundException('QR vencido o inválido.');
      const table = await this.operationalContext.lockActiveVisit(
        manager,
        visit.id,
        timeZone,
      );
      if (table.qrHash !== hash)
        throw new NotFoundException('QR vencido o inválido.');
      return {
        visitId: visit.id,
        tableId: table.id,
        tableCode: table.code,
        qrVersion: table.qrVersion,
      };
    });
  }

  private resolveQrFindMesa(
    manager: EntityManager,
    input: { hash: string },
  ): Promise<ResolveQrFindMesaRow[]> {
    return manager
      .getRepository(RestaurantTable)
      .createQueryBuilder('m')
      .select('v."id_visita" AS id')
      .innerJoin(TableVisit, 'v', 'v."id_mesa"=m."id_mesa"')
      .where('m."qr_hash"=:hash AND v."estado"=\'open\'')
      .setParameters({ hash: input.hash })
      .getRawMany<ResolveQrFindMesaRow>();
  }
}
