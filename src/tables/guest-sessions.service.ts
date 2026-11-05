import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { CreateGuestSessionDto } from './dto/table-access.dto.js';
import { GuestSessionsRepository } from './repositories/guest-sessions.repository.js';
import { auditTableOperation } from './table-audit.js';

export const hashAccessSecret = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');
export interface GuestIdentity {
  clientId: string;
  guestSessionId: string;
}

@Injectable()
export class GuestSessionsService {
  constructor(
    private readonly db: DataSource,
    private readonly persistence: GuestSessionsRepository = new GuestSessionsRepository(),
  ) {}

  async create(dto: CreateGuestSessionDto) {
    const token = `guest_${randomBytes(32).toString('base64url')}`;
    return this.db.transaction(async (manager) => {
      const [client] = await this.persistence.createInsertCliente(manager, {
        name: dto.name,
        phone: dto.phone || null,
      });
      const [session] = await this.persistence.createInsertSesionCliente(
        manager,
        { id: client.id, token: hashAccessSecret(token) },
      );
      await auditTableOperation(
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
    const [session] = await this.persistence.authenticateFindSesionCliente(
      this.db.manager,
      { token: hashAccessSecret(token) },
    );
    if (!session) throw new UnauthorizedException('Sesión invitada no válida.');
    return session;
  }

  async revoke(identity: GuestIdentity) {
    await this.db.transaction(async (manager) => {
      const sessions = await this.persistence.revokeUpdateSesionCliente(
        manager,
        {
          guestSessionId: identity.guestSessionId,
          clientId: identity.clientId,
        },
      );
      if (!sessions.length)
        throw new UnauthorizedException('Sesión invitada no válida.');
      await auditTableOperation(
        manager,
        identity,
        'sesion_cliente',
        identity.guestSessionId,
        'guest_session.revoked',
        { clientId: identity.clientId },
      );
    });
  }
}
