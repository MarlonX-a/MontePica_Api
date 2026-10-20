import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedRequestContext } from './auth.types.js';

export const CurrentUserContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedRequestContext => {
    const request = context.switchToHttp().getRequest<Request & {
      authContext?: AuthenticatedRequestContext;
    }>();
    if (!request.authContext) throw new UnauthorizedException('Sesión no válida.');
    return request.authContext;
  },
);
