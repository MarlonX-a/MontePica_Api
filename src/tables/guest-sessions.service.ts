import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { auditTableOperation } from './table-audit.js';
import type { CreateGuestSessionDto } from './dto/table-access.dto.js';

export const hashAccessSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
export interface GuestIdentity { clientId: string; guestSessionId: string }

@Injectable()
export class GuestSessionsService {
  constructor(private readonly db: DataSource) {}

  async create(dto: CreateGuestSessionDto) {
    const token = `guest_${randomBytes(32).toString('base64url')}`;
    return this.db.transaction(async manager => {
      const [client] = await manager.query(`INSERT INTO "cliente" ("nombre_contacto","telefono") VALUES ($1,$2)
        RETURNING "id_cliente" AS id,"nombre_contacto" AS name,"telefono" AS phone`, [dto.name, dto.phone || null]);
      const [session] = await manager.query(`INSERT INTO "sesion_cliente" ("id_cliente","token_hash","expira_en")
        VALUES ($1,$2,clock_timestamp()+interval '24 hours') RETURNING "id_sesion_cliente" AS id,"expira_en" AS "expiresAt"`,
      [client.id, hashAccessSecret(token)]);
      await auditTableOperation(manager, { guestSessionId: session.id }, 'sesion_cliente', session.id,
        'guest_session.created', { clientId: client.id, expiresAt: session.expiresAt });
      return { client, token, sessionId: session.id, expiresAt: session.expiresAt };
    });
  }

  async authenticate(token: string): Promise<GuestIdentity> {
    if (!/^guest_[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Sesión invitada no válida.');
    const [session] = await this.db.query(`SELECT s."id_sesion_cliente" AS "guestSessionId",s."id_cliente" AS "clientId"
      FROM "sesion_cliente" s JOIN "cliente" c ON c."id_cliente"=s."id_cliente"
      WHERE s."token_hash"=$1 AND s."revocada_en" IS NULL AND s."expira_en">clock_timestamp() AND c."id_usuario" IS NULL`,
    [hashAccessSecret(token)]);
    if (!session) throw new UnauthorizedException('Sesión invitada no válida.');
    return session;
  }

  async revoke(identity: GuestIdentity) {
    await this.db.transaction(async manager => {
      const [sessions] = await manager.query(`UPDATE "sesion_cliente" SET "revocada_en"=clock_timestamp()
        WHERE "id_sesion_cliente"=$1 AND "id_cliente"=$2 AND "revocada_en" IS NULL AND "expira_en">clock_timestamp()
        RETURNING "id_sesion_cliente"`, [identity.guestSessionId, identity.clientId]);
      if (!sessions.length) throw new UnauthorizedException('Sesión invitada no válida.');
      await auditTableOperation(manager, identity, 'sesion_cliente', identity.guestSessionId,
        'guest_session.revoked', { clientId: identity.clientId });
    });
  }
}
