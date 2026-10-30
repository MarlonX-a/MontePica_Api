import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { ClientAccessGuard, GuestSessionGuard } from './client-access.guard.js';
import { GuestSessionsService } from './guest-sessions.service.js';

describe('Client access guards', () => {
  const request: { headers: { authorization?: string }; authContext?: { userId: string; sessionId: string }; clientIdentity?: unknown } = { headers: {} };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
  const authenticate = vi.fn();
  const canActivate = vi.fn();
  const query = vi.fn();
  const guests = { authenticate } as unknown as GuestSessionsService;
  const guard = new ClientAccessGuard(guests, { canActivate } as unknown as AuthAccessGuard, { query } as unknown as DataSource);
  beforeEach(() => { vi.resetAllMocks(); request.headers = {}; delete request.authContext; delete request.clientIdentity; });

  it('requires a Bearer token before querying identity', async () => {
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('resolves guest identity from its session rather than JWT', async () => {
    request.headers.authorization = 'Bearer guest_test';
    authenticate.mockResolvedValue({ clientId: 'client', guestSessionId: 'session' });
    await guard.canActivate(context);
    expect(request.clientIdentity).toEqual({ clientId: 'client', guestSessionId: 'session' });
    expect(canActivate).not.toHaveBeenCalled();
  });

  it('preserves JWT session verification and rejects staff', async () => {
    request.headers.authorization = 'Bearer jwt';
    canActivate.mockImplementation(() => { request.authContext = { userId: 'user', sessionId: 'session' }; return true; });
    query.mockResolvedValue([{ clientId: null, roleCode: 'worker' }]);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(canActivate).toHaveBeenCalledWith(context);
  });

  it('derives clientId from the active user', async () => {
    request.headers.authorization = 'Bearer jwt';
    canActivate.mockImplementation(() => { request.authContext = { userId: 'user', sessionId: 'session' }; return true; });
    query.mockResolvedValue([{ clientId: 'client-from-db', roleCode: 'client' }]);
    await guard.canActivate(context);
    expect(request.clientIdentity).toEqual({ clientId: 'client-from-db', userId: 'user', userSessionId: 'session' });
  });

  it('does not bypass an invalid JWT', async () => {
    request.headers.authorization = 'Bearer expired-jwt';
    canActivate.mockRejectedValue(new UnauthorizedException());
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).not.toHaveBeenCalled();
  });

  it('uses guest authentication for the guest-only guard', async () => {
    request.headers.authorization = 'Bearer jwt';
    authenticate.mockRejectedValue(new UnauthorizedException());
    await expect(new GuestSessionGuard(guests).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(canActivate).not.toHaveBeenCalled();
  });
});
