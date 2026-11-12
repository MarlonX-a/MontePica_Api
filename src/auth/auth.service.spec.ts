import { UnauthorizedException } from '@nestjs/common';
import { type JwtService } from '@nestjs/jwt';
import { type DataSource } from 'typeorm';
import { IdentityService } from '../common/identity/identity.service.js';
import { PermissionLookupService } from '../common/identity/permission-lookup.service.js';
import { AuthService } from './auth.service.js';
import { verifyPassword } from './password.util.js';

vi.mock('./password.util.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./password.util.js')>()),
  verifyPassword: vi.fn(),
}));

describe('AuthService login', () => {
  const manager = {},
    identities = {
      lockUserByEmail: vi.fn(),
      findUserRole: vi.fn(),
      findProfile: vi.fn(),
      findClient: vi.fn(),
      createSession: vi.fn(),
    },
    permissions = { forRole: vi.fn() },
    jwt = { signAsync: vi.fn() };
  const transaction = vi.fn((work: (context: typeof manager) => unknown) =>
    work(manager),
  );
  const service = new AuthService(
    {} as never,
    { transaction } as unknown as DataSource,
    jwt as unknown as JwtService,
    identities as unknown as IdentityService,
    permissions as unknown as PermissionLookupService,
    { append: vi.fn() } as never,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation((work) => work(manager));
    identities.findUserRole.mockResolvedValue({
      id: 'role',
      code: 'client',
      name: 'Cliente',
    });
    identities.findProfile.mockResolvedValue({ names: 'Maria', phone: null });
    identities.findClient.mockResolvedValue({ id: 'client', phone: null });
    identities.createSession.mockResolvedValue({ id: 'session' });
    permissions.forRole.mockResolvedValue(['catalog.read']);
    jwt.signAsync.mockResolvedValue('access');
  });
  it('normalizes the email and uses the same transaction for identity, session and permissions', async () => {
    identities.lockUserByEmail.mockResolvedValue({
      id: 'user',
      normalizedEmail: 'maria@example.com',
      passwordHash: 'encoded',
      active: true,
      accessVersion: 0,
    });
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const result = await service.login({
      email: ' Maria@Example.com ',
      password: 'Secret123',
    });
    expect(identities.lockUserByEmail).toHaveBeenCalledWith(
      manager,
      'maria@example.com',
    );
    expect(verifyPassword).toHaveBeenCalledWith('Secret123', 'encoded');
    expect(identities.createSession).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ userId: 'user', generation: 0 }),
    );
    expect(permissions.forRole).toHaveBeenCalledWith(manager, 'role');
    expect(result).toMatchObject({
      accessToken: 'access',
      user: { id: 'user', permissions: ['catalog.read'] },
    });
  });
  it('does not create a session for an incorrect password', async () => {
    identities.lockUserByEmail.mockResolvedValue({
      id: 'user',
      active: true,
      passwordHash: 'encoded',
    });
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(
      service.login({ email: 'maria@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(identities.createSession).not.toHaveBeenCalled();
  });
  it('still verifies the dummy hash for an unknown email', async () => {
    identities.lockUserByEmail.mockResolvedValue(null);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(
      service.login({ email: 'unknown@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyPassword).toHaveBeenCalledWith('wrong', undefined);
    expect(identities.createSession).not.toHaveBeenCalled();
  });
});
