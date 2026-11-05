import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequestContext } from './auth.types.js';
import { IdentityRepository } from './repositories/identity.repository.js';
import { PermissionsRepository } from './repositories/permissions.repository.js';

@Injectable()
export class AccessIdentityService {
  constructor(
    private readonly db: DataSource,
    private readonly identities: IdentityRepository = new IdentityRepository(),
    private readonly permissions: PermissionsRepository = new PermissionsRepository(),
  ) {}
  async authenticatedSession(payload: {
    sub: string;
    sid: string;
    av: number;
  }): Promise<AuthenticatedRequestContext | null> {
    const session = await this.identities.findSession(
      this.db.manager,
      payload.sid,
      payload.sub,
    );
    if (!session) return null;
    const user = await this.identities.findActiveUser(
      this.db.manager,
      payload.sub,
    );
    if (!user?.active || user.accessVersion !== payload.av) return null;
    return { userId: user.id, sessionId: session.id };
  }
  permissionCodes(userId: string): Promise<string[]> {
    return this.permissions.forUser(this.db.manager, userId);
  }
  clientForUser(userId: string) {
    return this.permissions.clientIdentity(this.db.manager, userId);
  }
}
