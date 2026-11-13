import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { type CreateGuestSessionDto } from './dto/create-guest-session.dto.js';
import { GuestSession } from './entities/guest-session.entity.js';
import {
  AuthenticateFindSesionClienteRow,
  CreateInsertClienteRow,
  CreateInsertSesionClienteRow,
  RevokeUpdateSesionClienteRow,
} from './types/guest-sessions.types.js';

export const hashAccessSecret = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');

export interface GuestIdentity {
  clientId: string;
  guestSessionId: string;
}

@Injectable()
export class GuestSessionsService {
  constructor(
    @InjectRepository(GuestSession)
    private readonly records: Repository<GuestSession>,
    private readonly db: DataSource,
    private readonly auditLog: AuditService,
  ) {}

  create(dto: CreateGuestSessionDto) {
    const token = `guest_${randomBytes(32).toString('base64url')}`;
    return this.db.transaction(async (manager) => {
      const [client] = await this.createInsertCliente(manager, {
        name: dto.name,
        phone: dto.phone || null,
      });
      const [session] = await this.createInsertSesionCliente(manager, {
        id: client.id,
        token: hashAccessSecret(token),
      });
      await this.auditLog.append(
        manager,
        { guestSessionId: session.id },
        'sesion_cliente',
        session.id,
        'guest_session.created',
        { clientId: client.id, expiresAt: session.expiresAt },
      );
      return {
        client,
        token,
        sessionId: session.id,
        expiresAt: session.expiresAt,
      };
    });
  }

  async authenticate(token: string): Promise<GuestIdentity> {
    if (!/^guest_[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException('Sesión invitada no válida.');
    const [session] = await this.authenticateFindSesionCliente(
      this.records.manager,
      { token: hashAccessSecret(token) },
    );
    if (!session) throw new UnauthorizedException('Sesión invitada no válida.');
    return session;
  }

  async revoke(identity: GuestIdentity) {
    await this.db.transaction(async (manager) => {
      const sessions = await this.revokeUpdateSesionCliente(manager, {
        guestSessionId: identity.guestSessionId,
        clientId: identity.clientId,
      });
      if (!sessions.length)
        throw new UnauthorizedException('Sesión invitada no válida.');
      await this.auditLog.append(
        manager,
        identity,
        'sesion_cliente',
        identity.guestSessionId,
        'guest_session.revoked',
        { clientId: identity.clientId },
      );
    });
  }

  private createInsertCliente(
    manager: EntityManager,
    input: { name: string; phone: string | null },
  ): Promise<CreateInsertClienteRow[]> {
    return manager
      .getRepository(Client)
      .createQueryBuilder()
      .insert()
      .values([{ contactName: input.name, phone: input.phone }])
      .returning(
        '"id_cliente" AS id,"nombre_contacto" AS name,"telefono" AS phone',
      )
      .execute()
      .then((result) => result.raw);
  }

  private createInsertSesionCliente(
    manager: EntityManager,
    input: { id: string; token: string },
  ): Promise<CreateInsertSesionClienteRow[]> {
    return manager
      .getRepository(GuestSession)
      .createQueryBuilder()
      .insert()
      .values([
        {
          id_cliente: input.id,
          token_hash: input.token,
          expira_en: () => "clock_timestamp()+interval '24 hours'",
        },
      ])
      .returning('"id_sesion_cliente" AS id,"expira_en" AS "expiresAt"')
      .execute()
      .then((result) => result.raw);
  }

  private authenticateFindSesionCliente(
    manager: EntityManager,
    input: { token: string },
  ): Promise<AuthenticateFindSesionClienteRow[]> {
    return manager
      .getRepository(GuestSession)
      .createQueryBuilder('s')
      .select([
        's."id_sesion_cliente" AS "guestSessionId"',
        's."id_cliente" AS "clientId"',
      ])
      .innerJoin(Client, 'c', 'c."id_cliente"=s."id_cliente"')
      .where(
        's."token_hash"=:token AND s."revocada_en" IS NULL AND s."expira_en">clock_timestamp() AND c."id_usuario" IS NULL',
      )
      .setParameters({ token: input.token })
      .getRawMany<AuthenticateFindSesionClienteRow>();
  }

  private async revokeUpdateSesionCliente(
    manager: EntityManager,
    input: { guestSessionId: string; clientId: string },
  ): Promise<RevokeUpdateSesionClienteRow[]> {
    const rows = await manager
      .getRepository(GuestSession)
      .createQueryBuilder()
      .update(GuestSession)
      .set({ revocada_en: () => 'clock_timestamp()' })
      .where(
        '"id_sesion_cliente"=:guestSessionId AND "id_cliente"=:clientId AND "revocada_en" IS NULL AND "expira_en">clock_timestamp()',
      )
      .returning('"id_sesion_cliente"')
      .setParameters({
        guestSessionId: input.guestSessionId,
        clientId: input.clientId,
      })
      .execute()
      .then((result) => result.raw);
    return rows;
  }
}
