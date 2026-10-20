import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { PermissionsGuard } from './permissions.guard.js';

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
  const query = vi.fn();
  const guard = new PermissionsGuard(reflector, { query } as unknown as DataSource);
  const context = (authContext?: { userId: string; sessionId: string }) => ({
    getHandler: () => ({}), getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ authContext }) }),
  }) as unknown as ExecutionContext;

  beforeEach(() => { query.mockReset(); reflector.getAllAndOverride = vi.fn().mockReturnValue('catalog.visibility'); });

  it('permite al trabajador cambiar visibilidad consultando sus permisos vigentes', async () => {
    query.mockResolvedValue([{ codigo: 'catalog.read' }, { codigo: 'catalog.visibility' }]);
    await expect(guard.canActivate(context({ userId: 'worker-id', sessionId: 'session-id' }))).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('JOIN rol_permiso'), ['worker-id']);
  });

  it('deniega al trabajador editar el catálogo', async () => {
    reflector.getAllAndOverride = vi.fn().mockReturnValue('catalog.write');
    query.mockResolvedValue([{ codigo: 'catalog.read' }, { codigo: 'catalog.visibility' }]);
    await expect(guard.canActivate(context({ userId: 'worker-id', sessionId: 'session-id' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deniega al cliente sin permisos administrativos', async () => {
    query.mockResolvedValue([]);
    await expect(guard.canActivate(context({ userId: 'client-id', sessionId: 'session-id' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza cuando el guard JWT no dejó una sesión autenticada', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
