const participantColumns = `p."id_participante" AS id,p."id_visita" AS "visitId",p."id_cliente" AS "clientId",
 p."alias",p."estado" AS status,p."qr_version_aprobada" AS "requestedQrVersion",p."solicitada_en" AS "requestedAt",
 p."aprobada_en" AS "approvedAt",p."finalizada_en" AS "finishedAt",p."motivo_rechazo" AS "rejectionReason",
 CASE WHEN c."id_cuenta" IS NULL THEN NULL ELSE json_build_object('id',c."id_cuenta",'status',c."estado",'modality',c."modalidad",'createdAt',c."creada_en",'closedAt',c."cerrada_en") END AS account`;

import type {
  ParticipantQueryDto,
  VisitsQueryDto,
} from '../dto/participation.dto.js';

// Read builders

// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
// Read builders
import type { EntityManager } from 'typeorm';
export interface AuthenticateFindSesionClienteRow {
  '1': string;
}
export interface AuthenticateFindClienteRow {
  '1': string;
}
export interface AuthenticateFindParticipanteRow {
  '1': string;
}
export interface RequestFindParticipanteRow {
  '1': string;
}
export interface RequestInsertParticipanteRow {
  id: string;
}
export interface GetParticipantFindParticipanteRow {
  id: string;
  visitId: string;
  clientId: string;
  alias: string;
  status: string;
  requestedQrVersion: number;
  requestedAt: Date;
  approvedAt: Date;
  finishedAt: Date;
  rejectionReason: string;
  account: { id: string; status: string } | null;
}
export interface ParticipantsFindVisitaMesaRow {
  '1': string;
}
export interface ParticipantsFindParticipanteRow {
  total: number;
}
export interface ParticipantsFindParticipanteNextRow {
  id: string;
  visitId: string;
  clientId: string;
  alias: string;
  status: string;
  requestedQrVersion: number;
  requestedAt: Date;
  approvedAt: Date;
  finishedAt: Date;
  rejectionReason: string;
  account: { id: string; status: string } | null;
}
export interface VisitsFindVisitaMesaRow {
  total: number;
}
export interface VisitsFindVisitaMesaNextRow {
  id: string;
  tableId: string;
  operatingDayId: string;
  status: string;
  openedAt: Date;
  closedAt: Date;
  openedBy: string;
  closedBy: string;
}
export interface VisitFindVisitaMesaRow {
  id: string;
  tableId: string;
  operatingDayId: string;
  status: string;
  openedAt: Date;
  closedAt: Date;
  openedBy: string;
  closedBy: string;
}
export interface TransitionFindParticipanteRow {
  visitId: string;
  clientId: string;
}
export interface TransitionFindParticipanteNextRow {
  id_participante: string;
  id_visita: string;
  id_cliente: string;
  sesion_origen_id: string;
  solicitada_desde: string;
  aprobada_por: string;
  alias: string;
  estado: string;
  qr_version_aprobada: number;
  solicitada_en: Date;
  aprobada_en: Date;
  finalizada_en: Date;
  motivo_rechazo: string;
}
export interface TransitionFindVisitaMesaRow {
  dayId: string;
  version: number;
}
export interface TransitionFindSesionClienteRow {
  '1': string;
}
export interface TransitionFindParticipanteNextNextRow {
  '1': string;
}
export interface LockVisitFindVisitaMesaRow {
  id_jornada: string;
  id_mesa: string;
}
export interface LockVisitFindVisitaMesaNextRow {
  estado: string;
}
export interface CloseFindParticipanteRow {
  id: string;
  status: string;
}
export interface CloseUpdateVisitaMesaRow {
  id: string;
  status: string;
  closedAt: Date;
}
export interface AssertAccountsEmptyFindParticipanteRow {
  '1': string;
}
export class ParticipantsRepository {
  async authenticateFindSesionCliente(
    manager: EntityManager,
    input: { guestSessionId: string; clientId: string },
  ): Promise<AuthenticateFindSesionClienteRow[]> {
    return manager.query<AuthenticateFindSesionClienteRow[]>(
      `SELECT 1 FROM "sesion_cliente" WHERE "id_sesion_cliente"=$1 AND "id_cliente"=$2 AND "revocada_en" IS NULL AND "expira_en">clock_timestamp() FOR SHARE`,
      [input.guestSessionId, input.clientId],
    );
  }
  async authenticateFindCliente(
    manager: EntityManager,
    input: {
      clientId: string;
      userId: string | undefined;
      userSessionId: string | undefined;
    },
  ): Promise<AuthenticateFindClienteRow[]> {
    return manager.query<AuthenticateFindClienteRow[]>(
      `SELECT 1 FROM "cliente" c JOIN "usuario" u ON u."id_usuario"=c."id_usuario" JOIN "rol" r ON r."id_rol"=u."id_rol" JOIN "sesion_usuario" s ON s."id_usuario"=u."id_usuario" WHERE c."id_cliente"=$1 AND u."id_usuario"=$2 AND u."activo" AND r."codigo"='client' AND s."id_sesion_usuario"=$3 AND s."revocada_en" IS NULL AND s."expira_en">clock_timestamp() FOR SHARE OF u,s`,
      [input.clientId, input.userId, input.userSessionId],
    );
  }
  async authenticateFindParticipante(
    manager: EntityManager,
    input: { participantId: string; clientId: string },
  ): Promise<AuthenticateFindParticipanteRow[]> {
    return manager.query<AuthenticateFindParticipanteRow[]>(
      'SELECT 1 FROM "participante" WHERE "id_participante"=$1 AND "id_cliente"=$2',
      [input.participantId, input.clientId],
    );
  }
  async requestFindCliente(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<void> {
    await manager.query(
      'SELECT "id_cliente" FROM "cliente" WHERE "id_cliente"=$1 FOR UPDATE',
      [input.clientId],
    );
  }
  async requestFindParticipante(
    manager: EntityManager,
    input: { visitId: string; clientId: string },
  ): Promise<RequestFindParticipanteRow[]> {
    return manager.query<RequestFindParticipanteRow[]>(
      'SELECT 1 FROM "participante" WHERE "id_visita"=$1 AND "id_cliente"=$2',
      [input.visitId, input.clientId],
    );
  }
  async requestInsertParticipante(
    manager: EntityManager,
    input: {
      visitId: string;
      clientId: string;
      guestSessionId: string | null;
      userId: string | null;
      alias: string;
      qrVersion: number;
    },
  ): Promise<RequestInsertParticipanteRow[]> {
    return manager.query<RequestInsertParticipanteRow[]>(
      `INSERT INTO "participante" ("id_visita","id_cliente","sesion_origen_id","solicitada_desde","alias","qr_version_aprobada")
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING "id_participante" AS id`,
      [
        input.visitId,
        input.clientId,
        input.guestSessionId,
        input.userId,
        input.alias,
        input.qrVersion,
      ],
    );
  }
  async getParticipantFindParticipante(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<GetParticipantFindParticipanteRow[]> {
    return manager.query<GetParticipantFindParticipanteRow[]>(
      `SELECT ${participantColumns} FROM "participante" p LEFT JOIN "cuenta_consumo" c ON c."id_participante"=p."id_participante" WHERE p."id_participante"=$1 AND ($2::uuid IS NULL OR p."id_cliente"=$2)`,
      [input.id, input.clientId],
    );
  }
  async participantsFindVisitaMesa(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<ParticipantsFindVisitaMesaRow[]> {
    return manager.query<ParticipantsFindVisitaMesaRow[]>(
      'SELECT 1 FROM "visita_mesa" WHERE "id_visita"=$1',
      [input.visitId],
    );
  }
  private async participantsFindParticipante(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ParticipantsFindParticipanteRow[]> {
    return manager.query<ParticipantsFindParticipanteRow[]>(
      `SELECT count(*)::int AS total FROM "participante" p WHERE ${fragment0}`,
      parameters,
    );
  }
  private async participantsFindParticipanteNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
  ): Promise<ParticipantsFindParticipanteNextRow[]> {
    return manager.query<ParticipantsFindParticipanteNextRow[]>(
      `SELECT ${fragment0} FROM "participante" p LEFT JOIN "cuenta_consumo" c ON c."id_participante"=p."id_participante" WHERE ${fragment1} ORDER BY p."solicitada_en" DESC,p."id_participante" DESC LIMIT $4 OFFSET $5`,
      parameters,
    );
  }
  private async visitsFindVisitaMesa(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<VisitsFindVisitaMesaRow[]> {
    return manager.query<VisitsFindVisitaMesaRow[]>(
      `SELECT count(*)::int AS total FROM "visita_mesa" v WHERE ${fragment0}`,
      parameters,
    );
  }
  private async visitsFindVisitaMesaNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<VisitsFindVisitaMesaNextRow[]> {
    return manager.query<VisitsFindVisitaMesaNextRow[]>(
      `SELECT v."id_visita" AS id,v."id_mesa" AS "tableId",v."id_jornada" AS "operatingDayId",v."estado" AS status,v."abierta_en" AS "openedAt",v."cerrada_en" AS "closedAt",v."abierta_por" AS "openedBy",v."cerrada_por" AS "closedBy" FROM "visita_mesa" v WHERE ${fragment0} ORDER BY v."abierta_en" DESC,v."id_visita" DESC LIMIT $4 OFFSET $5`,
      parameters,
    );
  }
  async visitFindVisitaMesa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<VisitFindVisitaMesaRow[]> {
    return manager.query<VisitFindVisitaMesaRow[]>(
      `SELECT "id_visita" AS id,"id_mesa" AS "tableId","id_jornada" AS "operatingDayId","estado" AS status,"abierta_en" AS "openedAt","cerrada_en" AS "closedAt","abierta_por" AS "openedBy","cerrada_por" AS "closedBy" FROM "visita_mesa" WHERE "id_visita"=$1`,
      [input.id],
    );
  }
  async transitionFindParticipante(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindParticipanteRow[]> {
    return manager.query<TransitionFindParticipanteRow[]>(
      'SELECT "id_visita" AS "visitId","id_cliente" AS "clientId" FROM "participante" WHERE "id_participante"=$1',
      [input.id],
    );
  }
  async transitionFindParticipanteNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<TransitionFindParticipanteNextRow[]> {
    return manager.query<TransitionFindParticipanteNextRow[]>(
      'SELECT * FROM "participante" WHERE "id_participante"=$1 FOR UPDATE',
      [input.id],
    );
  }
  async transitionFindVisitaMesa(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<TransitionFindVisitaMesaRow[]> {
    return manager.query<TransitionFindVisitaMesaRow[]>(
      `SELECT v."id_jornada" AS "dayId",m."qr_version" AS version FROM "visita_mesa" v JOIN "mesa" m ON m."id_mesa"=v."id_mesa" WHERE v."id_visita"=$1`,
      [input.visitId],
    );
  }
  async transitionFindSesionCliente(
    manager: EntityManager,
    input: { sesion_origen_id: string },
  ): Promise<TransitionFindSesionClienteRow[]> {
    return manager.query<TransitionFindSesionClienteRow[]>(
      `SELECT 1 FROM "sesion_cliente" WHERE "id_sesion_cliente"=$1 AND "revocada_en" IS NULL AND "expira_en">clock_timestamp() FOR SHARE`,
      [input.sesion_origen_id],
    );
  }
  async transitionFindParticipanteNextNext(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<TransitionFindParticipanteNextNextRow[]> {
    return manager.query<TransitionFindParticipanteNextNextRow[]>(
      `SELECT 1 FROM "participante" WHERE "id_cliente"=$1 AND "estado"='approved'`,
      [input.clientId],
    );
  }
  async transitionUpdateParticipante(
    manager: EntityManager,
    input: { id: string; userId: string | undefined },
  ): Promise<void> {
    await manager.query(
      `UPDATE "participante" SET "estado"='approved',"aprobada_por"=$2,"aprobada_en"=clock_timestamp() WHERE "id_participante"=$1`,
      [input.id, input.userId],
    );
  }
  async transitionInsertCuentaConsumo(
    manager: EntityManager,
    input: { clientId: string; id: string; dayId: string },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO "cuenta_consumo" ("id_cliente","id_participante","id_jornada") VALUES ($1,$2,$3)`,
      [input.clientId, input.id, input.dayId],
    );
  }
  async transitionUpdateParticipanteNext(
    manager: EntityManager,
    input: {
      id: string;
      next: 'rejected' | 'cancelled' | 'finished';
      reason: string | null;
    },
  ): Promise<void> {
    await manager.query(
      `UPDATE "participante" SET "estado"=$2,"finalizada_en"=clock_timestamp(),"motivo_rechazo"=$3 WHERE "id_participante"=$1`,
      [input.id, input.next, input.reason],
    );
  }
  async transitionUpdateCuentaConsumo(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE "cuenta_consumo" SET "estado"='closed',"cerrada_en"=clock_timestamp() WHERE "id_participante"=$1 AND "estado"='open'`,
      [input.id],
    );
  }
  async lockVisitFindVisitaMesa(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<LockVisitFindVisitaMesaRow[]> {
    return manager.query<LockVisitFindVisitaMesaRow[]>(
      'SELECT "id_jornada","id_mesa" FROM "visita_mesa" WHERE "id_visita"=$1',
      [input.visitId],
    );
  }
  async lockVisitFindJornadaOperativa(
    manager: EntityManager,
    input: { id_jornada: string },
  ): Promise<void> {
    await manager.query(
      'SELECT 1 FROM "jornada_operativa" WHERE "id_jornada"=$1 FOR UPDATE',
      [input.id_jornada],
    );
  }
  async lockVisitFindMesa(
    manager: EntityManager,
    input: { id_mesa: string },
  ): Promise<void> {
    await manager.query('SELECT 1 FROM "mesa" WHERE "id_mesa"=$1 FOR UPDATE', [
      input.id_mesa,
    ]);
  }
  async lockVisitFindVisitaMesaNext(
    manager: EntityManager,
    input: { visitId: string },
  ): Promise<LockVisitFindVisitaMesaNextRow[]> {
    return manager.query<LockVisitFindVisitaMesaNextRow[]>(
      'SELECT "estado" FROM "visita_mesa" WHERE "id_visita"=$1 FOR UPDATE',
      [input.visitId],
    );
  }
  async closeFindParticipante(
    manager: EntityManager,
    input: { id: string },
  ): Promise<CloseFindParticipanteRow[]> {
    return manager.query<CloseFindParticipanteRow[]>(
      `SELECT "id_participante" AS id,"estado" AS status FROM "participante" WHERE "id_visita"=$1 AND "estado" IN ('pending','approved') ORDER BY "id_cliente","id_participante" FOR UPDATE`,
      [input.id],
    );
  }
  async closeUpdateCuentaConsumo(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE "cuenta_consumo" SET "estado"='closed',"cerrada_en"=clock_timestamp() WHERE "id_participante" IN (SELECT "id_participante" FROM "participante" WHERE "id_visita"=$1 AND "estado"='approved') AND "estado"='open'`,
      [input.id],
    );
  }
  async closeUpdateParticipante(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE "participante" SET "estado"=CASE WHEN "estado"='pending' THEN 'cancelled' ELSE 'finished' END,"finalizada_en"=clock_timestamp() WHERE "id_visita"=$1 AND "estado" IN ('pending','approved')`,
      [input.id],
    );
  }
  async closeUpdateVisitaMesa(
    manager: EntityManager,
    input: { id: string; userId: string | undefined },
  ): Promise<CloseUpdateVisitaMesaRow[]> {
    const [rows] = await manager.query<[CloseUpdateVisitaMesaRow[], number]>(
      `UPDATE "visita_mesa" SET "estado"='closed',"cerrada_en"=clock_timestamp(),"cerrada_por"=$2 WHERE "id_visita"=$1 RETURNING "id_visita" AS id,"estado" AS status,"cerrada_en" AS "closedAt"`,
      [input.id, input.userId],
    );
    return rows;
  }
  async closeUpdateMesa(
    manager: EntityManager,
    input: { id_mesa: string },
  ): Promise<void> {
    await manager.query('UPDATE "mesa" SET "qr_hash"=NULL WHERE "id_mesa"=$1', [
      input.id_mesa,
    ]);
  }
  async assertAccountsEmptyFindParticipante(
    manager: EntityManager,
    parameters: unknown[],
    scope: 'participant' | 'visit',
  ): Promise<AssertAccountsEmptyFindParticipanteRow[]> {
    return manager.query<AssertAccountsEmptyFindParticipanteRow[]>(
      `SELECT 1 FROM participante p JOIN cuenta_consumo c ON c.id_participante=p.id_participante WHERE ${scope === 'participant' ? 'p."id_participante"=$1' : 'p."id_visita"=$1'} AND (EXISTS (SELECT 1 FROM asignacion_consumo a WHERE a.id_cuenta=c.id_cuenta AND a.estado='active' AND NOT EXISTS (SELECT 1 FROM detalle_liquidacion dl JOIN liquidacion l ON l.id_liquidacion=dl.id_liquidacion WHERE dl.id_asignacion=a.id_asignacion AND dl.vigente AND l.estado='settled')) OR EXISTS (SELECT 1 FROM pedido o JOIN version_pedido v ON v.id_pedido=o.id_pedido JOIN detalle_pedido d ON d.id_version=v.id_version JOIN reserva_inventario r ON r.id_detalle=d.id_detalle WHERE o.id_cuenta=c.id_cuenta AND r.estado='active')) LIMIT 1`,
      parameters,
    );
  }

  async listVisits(manager: EntityManager, query: VisitsQueryDto) {
    const where = `($1::uuid IS NULL OR v."id_mesa"=$1) AND ($2::uuid IS NULL OR v."id_jornada"=$2) AND ($3::text IS NULL OR v."estado"=$3)`;
    const args = [
      query.tableId ?? null,
      query.operatingDayId ?? null,
      query.status ?? null,
    ];
    const [{ total }] = await this.visitsFindVisitaMesa(manager, args, where);
    const items = await this.visitsFindVisitaMesaNext(
      manager,
      [...args, query.limit, (query.page - 1) * query.limit],
      where,
    );
    return { items, total, page: query.page, limit: query.limit };
  }

  async listParticipants(
    manager: EntityManager,
    query: ParticipantQueryDto,
    filter: { clientId?: string; visitId?: string },
  ) {
    const where = `($1::uuid IS NULL OR p."id_cliente"=$1) AND ($2::uuid IS NULL OR p."id_visita"=$2) AND ($3::text IS NULL OR p."estado"=$3)`;
    const args = [
      filter.clientId ?? null,
      filter.visitId ?? null,
      query.status ?? null,
    ];
    const [{ total }] = await this.participantsFindParticipante(
      manager,
      args,
      where,
    );
    const items = await this.participantsFindParticipanteNext(
      manager,
      [...args, query.limit, (query.page - 1) * query.limit],
      participantColumns,
      where,
    );
    return { items, total, page: query.page, limit: query.limit };
  }
}
