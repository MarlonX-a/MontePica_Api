import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service.js';
import { Client } from './entities/client.entity.js';
import { Profile } from './entities/profile.entity.js';
import { Role } from './entities/role.entity.js';
import { User } from './entities/user.entity.js';
import { UserSession } from './entities/user-session.entity.js';
import { verifyPassword } from './password.util.js';

vi.mock('./password.util.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./password.util.js')>(),
  verifyPassword: vi.fn(),
}));

describe('AuthService login', () => {
  const userQueryBuilder = {
    addSelect: vi.fn(),
    setLock: vi.fn(),
    where: vi.fn(),
    getOne: vi.fn(),
  };
  const userRepository = { createQueryBuilder: vi.fn(() => userQueryBuilder) };
  const roleRepository = { findOneByOrFail: vi.fn() };
  const profileRepository = { findOneByOrFail: vi.fn() };
  const clientRepository = { findOneBy: vi.fn() };
  const sessionRepository = { create: vi.fn(), save: vi.fn() };
  const manager = {
    getRepository: vi.fn(),
    query: vi.fn(),
  };
  const dataSource = {
    transaction: vi.fn((work: (manager: typeof manager) => unknown) => work(manager)),
  };
  const jwtService = { signAsync: vi.fn() };
  const configService = {};
  let service: AuthService;

  beforeEach(() => {
    vi.resetAllMocks();
    userQueryBuilder.addSelect.mockReturnValue(userQueryBuilder);
    userQueryBuilder.setLock.mockReturnValue(userQueryBuilder);
    userQueryBuilder.where.mockReturnValue(userQueryBuilder);
    userRepository.createQueryBuilder.mockReturnValue(userQueryBuilder);
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === User) return userRepository;
      if (entity === Role) return roleRepository;
      if (entity === Profile) return profileRepository;
      if (entity === Client) return clientRepository;
      if (entity === UserSession) return sessionRepository;
      throw new Error('Unexpected repository');
    });
    manager.query.mockImplementation((sql: string) =>
      sql.includes('SELECT p.codigo') ? [{ codigo: 'catalog.read' }] : [{ id_rol: 'role-id' }],
    );
    sessionRepository.create.mockImplementation((values: object) => values);
    sessionRepository.save.mockImplementation(async (values: object) => ({ id: 'session-id', ...values }));
    roleRepository.findOneByOrFail.mockResolvedValue({ id: 'role-id', code: 'client', name: 'Cliente' });
    profileRepository.findOneByOrFail.mockResolvedValue({ names: 'María Zambrano', phone: '+593987654321' });
    clientRepository.findOneBy.mockResolvedValue({ id: 'client-id', phone: '+593987654321' });
    jwtService.signAsync.mockResolvedValue('access-token');
    service = new AuthService(
      dataSource as unknown as DataSource,
      jwtService as unknown as JwtService,
      configService as ConfigService,
    );
  });

  it('normalizes the email, verifies the password, starts a session, and returns tokens', async () => {
    const user = {
      id: 'user-id',
      normalizedEmail: 'maria@example.com',
      passwordHash: 'encoded-password',
      active: true,
      accessVersion: 0,
      role: undefined,
    } as User;
    userQueryBuilder.getOne.mockResolvedValue(user);
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const result = await service.login({ email: ' Maria@Example.com ', password: 'Secret123' });

    expect(userQueryBuilder.where).toHaveBeenCalledWith(
      'user.normalizedEmail = :normalizedEmail',
      { normalizedEmail: 'maria@example.com' },
    );
    expect(verifyPassword).toHaveBeenCalledWith('Secret123', 'encoded-password');
    expect(sessionRepository.save).toHaveBeenCalledOnce();
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      { sub: 'user-id', sid: 'session-id', av: 0 },
      { algorithm: 'HS256', issuer: 'montepica-api', audience: 'montepica-app' },
    );
    expect(result).toMatchObject({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { id: 'user-id', email: 'maria@example.com', permissions: ['catalog.read'] },
    });
  });

  it('rejects an incorrect password without creating a session', async () => {
    userQueryBuilder.getOne.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'encoded-password',
      active: true,
    });
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await expect(service.login({ email: 'maria@example.com', password: 'wrong' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown email and still verifies against the dummy hash', async () => {
    userQueryBuilder.getOne.mockResolvedValue(null);
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await expect(service.login({ email: 'unknown@example.com', password: 'wrong' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyPassword).toHaveBeenCalledWith('wrong', undefined);
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });
});
