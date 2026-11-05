import type { EntityManager } from 'typeorm';
export interface ResolveQrFindMesaRow {
  id: string;
}
export class TableAccessRepository {
  async resolveQrFindMesa(
    manager: EntityManager,
    input: { hash: string },
  ): Promise<ResolveQrFindMesaRow[]> {
    return manager.query<ResolveQrFindMesaRow[]>(
      `SELECT v."id_visita" AS id FROM "mesa" m JOIN "visita_mesa" v ON v."id_mesa"=m."id_mesa" WHERE m."qr_hash"=$1 AND v."estado"='open'`,
      [input.hash],
    );
  }
}
