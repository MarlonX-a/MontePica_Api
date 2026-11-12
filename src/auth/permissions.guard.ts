import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { AccessIdentityService } from './access-identity.service.js';
import { AuthenticatedRequestContext } from './auth.types.js';
import { REQUIRED_PERMISSION } from './permissions.decorator.js';

type RequestWithAuth = Request & { authContext?: AuthenticatedRequestContext };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: AccessIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;
    const auth = context
      .switchToHttp()
      .getRequest<RequestWithAuth>().authContext;
    if (!auth) throw new UnauthorizedException('Sesión no válida.');
    const permissions = await this.identity.permissionCodes(auth.userId);
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción.',
      );
    }
    return true;
  }
}
