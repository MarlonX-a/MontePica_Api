import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AdminService } from './admin.service.js';
import type { AdminRepository } from './repositories/admin.repository.js';
describe('AdminService', () => {
  const repository = {
    listRoles: vi.fn(),
    listUsers: vi.fn(),
    getUserFindUsuario: vi.fn(),
  };
  const manager = {};
  const service = new AdminService(
    { manager } as DataSource,
    repository as unknown as AdminRepository,
  );
  beforeEach(() => vi.resetAllMocks());
  it('returns roles from the current persistence view', async () => {
    const roles = [{ id: 'role', code: 'admin', permissions: ['users.read'] }];
    repository.listRoles.mockResolvedValue(roles);
    await expect(service.listRoles()).resolves.toEqual(roles);
    expect(repository.listRoles).toHaveBeenCalledWith(manager);
  });
  it('passes filters and pagination to the repository', async () => {
    const query = {
        search: 'Ana',
        roleCode: 'admin',
        active: true,
        page: 2,
        limit: 10,
      },
      page = { items: [{ id: 'user' }], total: 1, page: 2, limit: 10 };
    repository.listUsers.mockResolvedValue(page);
    await expect(service.listUsers(query)).resolves.toEqual(page);
    expect(repository.listUsers).toHaveBeenCalledWith(manager, query);
  });
  it('reports missing users', async () => {
    repository.getUserFindUsuario.mockResolvedValue([]);
    await expect(service.getUser('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
