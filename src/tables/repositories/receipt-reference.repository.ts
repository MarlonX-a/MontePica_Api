import type { EntityManager } from 'typeorm';
export class ReceiptReferenceRepository {
  async isReferenced(manager: EntityManager, key: string): Promise<boolean> {
    const rows = await manager.query<Array<{ exists: number }>>(
      'SELECT 1 AS exists FROM comprobante WHERE archivo_privado=$1',
      [key],
    );
    return rows.length > 0;
  }
}
