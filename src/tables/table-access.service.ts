import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hashAccessSecret } from './guest-sessions.service.js';
import { lockActiveVisit, lockTableOperations } from './table-operations.js';

@Injectable()
export class TableAccessService {
  constructor(private readonly db: DataSource) {}
  async resolveQr(token: string) {
    return this.db.transaction(async manager => {
      const timeZone = await lockTableOperations(manager);
      const hash = hashAccessSecret(token);
      const [visit] = await manager.query(`SELECT v."id_visita" AS id FROM "mesa" m JOIN "visita_mesa" v ON v."id_mesa"=m."id_mesa" WHERE m."qr_hash"=$1 AND v."estado"='open'`, [hash]);
      if (!visit) throw new NotFoundException('QR vencido o inválido.');
      const table = await lockActiveVisit(manager, visit.id, timeZone);
      if (table.qrHash !== hash) throw new NotFoundException('QR vencido o inválido.');
      return { visitId: visit.id, tableId: table.id, tableCode: table.code, qrVersion: table.qrVersion };
    });
  }
}
