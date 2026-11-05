import type { EntityManager } from 'typeorm';
export interface CreateTableInsertMesaRow {
  id: string;
  code: string;
  active: boolean;
}
export interface TablesFindMesaRow {
  id: string;
  code: string;
  active: boolean;
  openVisitId: string;
}
export interface TablesFindMesaNextRow {
  total: number;
}
export interface TableFindMesaRow {
  id: string;
  code: string;
  active: boolean;
  openVisitId: string;
}
export interface UpdateTableFindMesaRow {
  id: string;
  code: string;
  active: boolean;
}
export interface UpdateTableFindVisitaMesaRow {
  '1': string;
}
export interface UpdateTableUpdateMesaRow {
  id: string;
  code: string;
  active: boolean;
}
export interface OpenVisitFindJornadaOperativaRow {
  id: string;
}
export interface OpenVisitFindMesaRow {
  active: boolean;
}
export interface OpenVisitFindJornadaOperativaNextRow {
  current: boolean;
}
export interface OpenVisitFindVisitaMesaRow {
  id_visita: string;
}
export interface OpenVisitInsertVisitaMesaRow {
  id: string;
  status: string;
  openedAt: Date;
}
export interface IssueQrUpdateMesaRow {
  qrVersion: number;
}
export interface IssueQrUpdateParticipanteRow {
  id: string;
}
export class TablesRepository {
  async createTableInsertMesa(
    manager: EntityManager,
    input: { normalizedCode: string },
  ): Promise<CreateTableInsertMesaRow[]> {
    return manager.query<CreateTableInsertMesaRow[]>(
      `INSERT INTO "mesa" ("codigo") VALUES ($1) RETURNING "id_mesa" AS id,"codigo" AS code,"activa" AS active`,
      [input.normalizedCode],
    );
  }
  async tablesFindMesa(
    manager: EntityManager,
    input: { limit: number; offset: number },
  ): Promise<TablesFindMesaRow[]> {
    return manager.query<TablesFindMesaRow[]>(
      `SELECT m."id_mesa" AS id,m."codigo" AS code,m."activa" AS active,v."id_visita" AS "openVisitId"
      FROM "mesa" m LEFT JOIN "visita_mesa" v ON v."id_mesa"=m."id_mesa" AND v."estado"='open'
      ORDER BY m."codigo",m."id_mesa" LIMIT $1 OFFSET $2`,
      [input.limit, input.offset],
    );
  }
  async tablesFindMesaNext(
    manager: EntityManager,
  ): Promise<TablesFindMesaNextRow[]> {
    return manager.query<TablesFindMesaNextRow[]>(
      'SELECT count(*)::int AS total FROM "mesa"',
      [],
    );
  }
  async tableFindMesa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TableFindMesaRow[]> {
    return manager.query<TableFindMesaRow[]>(
      `SELECT m."id_mesa" AS id,m."codigo" AS code,m."activa" AS active,
      v."id_visita" AS "openVisitId" FROM "mesa" m LEFT JOIN "visita_mesa" v ON v."id_mesa"=m."id_mesa" AND v."estado"='open' WHERE m."id_mesa"=$1`,
      [input.id],
    );
  }
  async updateTableFindMesa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UpdateTableFindMesaRow[]> {
    return manager.query<UpdateTableFindMesaRow[]>(
      `SELECT "id_mesa" AS id,"codigo" AS code,"activa" AS active FROM "mesa" WHERE "id_mesa"=$1 FOR UPDATE`,
      [input.id],
    );
  }
  async updateTableFindVisitaMesa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UpdateTableFindVisitaMesaRow[]> {
    return manager.query<UpdateTableFindVisitaMesaRow[]>(
      `SELECT 1 FROM "visita_mesa" WHERE "id_mesa"=$1 AND "estado"='open'`,
      [input.id],
    );
  }
  async updateTableUpdateMesa(
    manager: EntityManager,
    input: { id: string; code: string; active: boolean },
  ): Promise<UpdateTableUpdateMesaRow[]> {
    const [rows] = await manager.query<[UpdateTableUpdateMesaRow[], number]>(
      `UPDATE "mesa" SET "codigo"=$2,"activa"=$3 WHERE "id_mesa"=$1 RETURNING "id_mesa" AS id,"codigo" AS code,"activa" AS active`,
      [input.id, input.code, input.active],
    );
    return rows;
  }
  async openVisitFindJornadaOperativa(
    manager: EntityManager,
    input: { timeZone: string },
  ): Promise<OpenVisitFindJornadaOperativaRow[]> {
    return manager.query<OpenVisitFindJornadaOperativaRow[]>(
      `SELECT "id_jornada" AS id FROM "jornada_operativa" WHERE "fecha_operativa"=timezone($1,clock_timestamp())::date AND "estado"='open' FOR UPDATE`,
      [input.timeZone],
    );
  }
  async openVisitFindMesa(
    manager: EntityManager,
    input: { tableId: string },
  ): Promise<OpenVisitFindMesaRow[]> {
    return manager.query<OpenVisitFindMesaRow[]>(
      `SELECT "activa" AS active FROM "mesa" WHERE "id_mesa"=$1 FOR UPDATE`,
      [input.tableId],
    );
  }
  async openVisitFindJornadaOperativaNext(
    manager: EntityManager,
    input: { id: string; timeZone: string },
  ): Promise<OpenVisitFindJornadaOperativaNextRow[]> {
    return manager.query<OpenVisitFindJornadaOperativaNextRow[]>(
      `SELECT "fecha_operativa"=timezone($2,clock_timestamp())::date AS current FROM "jornada_operativa" WHERE "id_jornada"=$1`,
      [input.id, input.timeZone],
    );
  }
  async openVisitFindVisitaMesa(
    manager: EntityManager,
    input: { tableId: string },
  ): Promise<OpenVisitFindVisitaMesaRow[]> {
    return manager.query<OpenVisitFindVisitaMesaRow[]>(
      `SELECT "id_visita" FROM "visita_mesa" WHERE "id_mesa"=$1 AND "estado"='open'`,
      [input.tableId],
    );
  }
  async openVisitInsertVisitaMesa(
    manager: EntityManager,
    input: { tableId: string; id: string; actor: string },
  ): Promise<OpenVisitInsertVisitaMesaRow[]> {
    return manager.query<OpenVisitInsertVisitaMesaRow[]>(
      `INSERT INTO "visita_mesa" ("id_mesa","id_jornada","abierta_por") VALUES ($1,$2,$3) RETURNING "id_visita" AS id,"estado" AS status,"abierta_en" AS "openedAt"`,
      [input.tableId, input.id, input.actor],
    );
  }
  async openVisitUpdateMesa(
    manager: EntityManager,
    input: { tableId: string },
  ): Promise<void> {
    await manager.query(`UPDATE "mesa" SET "qr_hash"=NULL WHERE "id_mesa"=$1`, [
      input.tableId,
    ]);
  }
  async issueQrUpdateMesa(
    manager: EntityManager,
    input: { id: string; token: string },
  ): Promise<IssueQrUpdateMesaRow[]> {
    const [rows] = await manager.query<[IssueQrUpdateMesaRow[], number]>(
      `UPDATE "mesa" SET "qr_hash"=$2,"qr_version"="qr_version"+1 WHERE "id_mesa"=$1 RETURNING "qr_version" AS "qrVersion"`,
      [input.id, input.token],
    );
    return rows;
  }
  async issueQrUpdateParticipante(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<IssueQrUpdateParticipanteRow[]> {
    const [rows] = await manager.query<
      [IssueQrUpdateParticipanteRow[], number]
    >(
      `UPDATE "participante" SET "estado"='cancelled',"finalizada_en"=clock_timestamp() WHERE "id_visita"=$1 AND "estado"='pending' RETURNING "id_participante" AS id`,
      [input.visitId],
    );
    return rows;
  }
}
