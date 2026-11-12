import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type ClientIdentity } from './client-access.guard.js';

@Injectable()
export class RegisteredClientGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ clientIdentity?: ClientIdentity }>();
    if (
      !request.clientIdentity?.userId ||
      request.clientIdentity.guestSessionId
    )
      throw new UnauthorizedException(
        'Se requiere una cuenta de cliente registrada.',
      );
    return true;
  }
}
