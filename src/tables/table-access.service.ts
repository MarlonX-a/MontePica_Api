import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hashAccessSecret } from './guest-sessions.service.js';
import { TableAccessRepository } from './repositories/table-access.repository.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

@Injectable()
export class TableAccessService {
  constructor(
    private readonly db: DataSource,
    private readonly persistence: TableAccessRepository = new TableAccessRepository(),
  ) {}
  async resolveQr(token: string) {
    return this.db.transaction(async (manager) => {
      const timeZone = await lockTableOperations(manager);
      const hash = hashAccessSecret(token);
      const [visit] = await this.persistence.resolveQrFindMesa(manager, {
        hash: hash,
      });
      if (!visit) throw new NotFoundException('QR vencido o inválido.');
      const table = await lockActiveVisit(manager, visit.id, timeZone);
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
}
