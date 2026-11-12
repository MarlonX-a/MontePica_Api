import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdentityService } from '../common/identity/identity.service.js';
import { PermissionLookupService } from '../common/identity/permission-lookup.service.js';
import { User } from '../users/entities/user.entity.js';
import { type AuthenticatedRequestContext } from './auth.types.js';

@Injectable()
export class AccessIdentityService {
  constructor(
    @InjectRepository(User) private readonly records: Repository<User>,
    private readonly identities: IdentityService,
    private readonly permissions: PermissionLookupService,
  ) {}

  async authenticatedSession(payload: {
    sub: string;
    sid: string;
    av: number;
  }): Promise<AuthenticatedRequestContext | null> {
    const session = await this.identities.findSession(
      this.records.manager,
      payload.sid,
      payload.sub,
    );
    if (!session) return null;
    const user = await this.identities.findActiveUser(
      this.records.manager,
      payload.sub,
    );
    if (!user?.active || user.accessVersion !== payload.av) return null;
    return { userId: user.id, sessionId: session.id };
  }

  permissionCodes(userId: string): Promise<string[]> {
    return this.permissions.forUser(this.records.manager, userId);
  }

  clientForUser(userId: string) {
    return this.permissions.clientIdentity(this.records.manager, userId);
  }
}
