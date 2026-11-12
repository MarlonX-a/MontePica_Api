import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { Receipt } from '../../transfers/entities/receipt.entity.js';

@Injectable()
export class ReceiptReconciliationService {
  async isReferenced(manager: EntityManager, key: string): Promise<boolean> {
    const rows = await manager
      .getRepository(Receipt)
      .createQueryBuilder('comprobante')
      .select('1 AS exists')
      .where('archivo_privado=:key')
      .setParameters({ key })
      .getRawMany();
    return rows.length > 0;
  }
}
