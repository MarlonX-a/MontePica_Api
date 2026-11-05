import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthenticatedRequestContext } from './auth.types.js';
import { AccessIdentityService } from './access-identity.service.js';

type AuthenticatedRequest = Request & {
  authContext?: AuthenticatedRequestContext;
};

@Injectable()
export class AuthAccessGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly identity: AccessIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Sesión no válida.');

    let payload: { sub: string; sid: string; av: number };
    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
        sid: string;
        av: number;
      }>(token, {
        algorithms: ['HS256'],
        issuer: 'montepica-api',
        audience: 'montepica-app',
      });
      if (!payload.sub || !payload.sid || !Number.isInteger(payload.av)) {
        throw new UnauthorizedException('Sesión no válida.');
      }
    } catch {
      throw new UnauthorizedException('Sesión no válida.');
    }

    const identity = await this.identity.authenticatedSession(payload);
    if (!identity) throw new UnauthorizedException('Sesión no válida.');
    request.authContext = identity;
    return true;
  }
}
