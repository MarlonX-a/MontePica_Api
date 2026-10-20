import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
import { AuthenticatedRequestContext } from './auth.types.js';
import { REQUIRED_PERMISSION } from './permissions.decorator.js';

type RequestWithAuth = Request & { authContext?: AuthenticatedRequestContext };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [
      context.getHandler(), context.getClass(),
    ]);
    if (!permission) return true;
    const auth = context.switchToHttp().getRequest<RequestWithAuth>().authContext;
    if (!auth) throw new UnauthorizedException('Sesión no válida.');
    const rows: { codigo: string }[] = await this.dataSource.query(
      `SELECT p.codigo FROM usuario u JOIN rol_permiso rp ON rp.id_rol = u.id_rol
       JOIN permiso p ON p.id_permiso = rp.id_permiso WHERE u.id_usuario = $1 AND u.activo = true`,
      [auth.userId],
    );
    if (!rows.some((row) => row.codigo === permission)) {
      throw new ForbiddenException('No tienes permiso para realizar esta acción.');
    }
    return true;
  }
}
