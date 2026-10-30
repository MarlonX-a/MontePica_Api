import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import type { Request } from 'express';
import { User } from './entities/user.entity.js';
import { UserSession } from './entities/user-session.entity.js';
import { AuthenticatedRequestContext } from './auth.types.js';

type AuthenticatedRequest = Request & { authContext?: AuthenticatedRequestContext };

@Injectable()
export class AuthAccessGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
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

    const session = await this.dataSource.getRepository(UserSession).findOne({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!session) throw new UnauthorizedException('Sesión no válida.');

    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: payload.sub, active: true },
    });
    if (!user?.active || user.accessVersion !== payload.av) {
      throw new UnauthorizedException('Sesión no válida.');
    }

    request.authContext = { userId: user.id, sessionId: session.id };
    return true;
  }
}
