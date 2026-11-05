import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AccessIdentityService } from '../auth/access-identity.service.js';
import {
  GuestSessionsService,
  type GuestIdentity,
} from './guest-sessions.service.js';

export interface ClientIdentity {
  clientId: string;
  guestSessionId?: string;
  userId?: string;
  userSessionId?: string;
}
type ClientRequest = Request & {
  clientIdentity?: ClientIdentity;
  authContext?: AuthenticatedRequestContext;
};

function bearer(request: Request) {
  const token = request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new UnauthorizedException('Sesión no válida.');
  return token;
}

@Injectable()
export class GuestSessionGuard implements CanActivate {
  constructor(private readonly guests: GuestSessionsService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    request.clientIdentity = await this.guests.authenticate(bearer(request));
    return true;
  }
}

@Injectable()
export class ClientAccessGuard implements CanActivate {
  constructor(
    private readonly guests: GuestSessionsService,
    private readonly jwtGuard: AuthAccessGuard,
    private readonly identity: AccessIdentityService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    const token = bearer(request);
    if (token.startsWith('guest_')) {
      request.clientIdentity = await this.guests.authenticate(token);
      return true;
    }
    await this.jwtGuard.canActivate(context);
    const userId = request.authContext!.userId;
    const client = await this.identity.clientForUser(userId);
    if (!client) throw new UnauthorizedException('Sesión no válida.');
    if (client.roleCode !== 'client' || !client.clientId)
      throw new ForbiddenException('Esta ruta requiere identidad de cliente.');
    request.clientIdentity = {
      clientId: client.clientId,
      userId,
      userSessionId: request.authContext!.sessionId,
    };
    return true;
  }
}

export const CurrentGuest = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GuestIdentity => {
    const identity = context
      .switchToHttp()
      .getRequest<ClientRequest>().clientIdentity;
    if (!identity?.guestSessionId)
      throw new UnauthorizedException('Sesión invitada no válida.');
    return {
      clientId: identity.clientId,
      guestSessionId: identity.guestSessionId,
    };
  },
);

export const CurrentClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientIdentity => {
    const identity = context
      .switchToHttp()
      .getRequest<ClientRequest>().clientIdentity;
    if (!identity) throw new UnauthorizedException('Sesión no válida.');
    return identity;
  },
);
