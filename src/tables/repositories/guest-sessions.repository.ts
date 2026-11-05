import type { EntityManager } from 'typeorm';
export interface CreateInsertClienteRow {
  id: string;
  name: string;
  phone: string;
}
export interface CreateInsertSesionClienteRow {
  id: string;
  expiresAt: Date;
}
export interface AuthenticateFindSesionClienteRow {
  guestSessionId: string;
  clientId: string;
}
export interface RevokeUpdateSesionClienteRow {
  id_sesion_cliente: string;
}
export class GuestSessionsRepository {
  async createInsertCliente(
    manager: EntityManager,
    input: { name: string; phone: string | null },
  ): Promise<CreateInsertClienteRow[]> {
    return manager.query<CreateInsertClienteRow[]>(
      `INSERT INTO "cliente" ("nombre_contacto","telefono") VALUES ($1,$2)
        RETURNING "id_cliente" AS id,"nombre_contacto" AS name,"telefono" AS phone`,
      [input.name, input.phone],
    );
  }
  async createInsertSesionCliente(
    manager: EntityManager,
    input: { id: string; token: string },
  ): Promise<CreateInsertSesionClienteRow[]> {
    return manager.query<CreateInsertSesionClienteRow[]>(
      `INSERT INTO "sesion_cliente" ("id_cliente","token_hash","expira_en")
        VALUES ($1,$2,clock_timestamp()+interval '24 hours') RETURNING "id_sesion_cliente" AS id,"expira_en" AS "expiresAt"`,
      [input.id, input.token],
    );
  }
  async authenticateFindSesionCliente(
    manager: EntityManager,
    input: { token: string },
  ): Promise<AuthenticateFindSesionClienteRow[]> {
    return manager.query<AuthenticateFindSesionClienteRow[]>(
      `SELECT s."id_sesion_cliente" AS "guestSessionId",s."id_cliente" AS "clientId"
      FROM "sesion_cliente" s JOIN "cliente" c ON c."id_cliente"=s."id_cliente"
      WHERE s."token_hash"=$1 AND s."revocada_en" IS NULL AND s."expira_en">clock_timestamp() AND c."id_usuario" IS NULL`,
      [input.token],
    );
  }
  async revokeUpdateSesionCliente(
    manager: EntityManager,
    input: { guestSessionId: string; clientId: string },
  ): Promise<RevokeUpdateSesionClienteRow[]> {
    const [rows] = await manager.query<
      [RevokeUpdateSesionClienteRow[], number]
    >(
      `UPDATE "sesion_cliente" SET "revocada_en"=clock_timestamp()
        WHERE "id_sesion_cliente"=$1 AND "id_cliente"=$2 AND "revocada_en" IS NULL AND "expira_en">clock_timestamp()
        RETURNING "id_sesion_cliente"`,
      [input.guestSessionId, input.clientId],
    );
    return rows;
  }
}
