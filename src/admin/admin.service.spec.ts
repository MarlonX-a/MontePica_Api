import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminService } from './admin.service.js';

describe('AdminService', () => {
  const query = vi.fn();
  let service: AdminService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new AdminService({ query } as unknown as DataSource);
  });

  it('loads the roles with their current permissions', async () => {
    const roles = [{ id: 'role-id', code: 'admin', permissions: ['users.read'] }];
    query.mockResolvedValue(roles);

    await expect(service.listRoles()).resolves.toEqual(roles);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN rol_permiso'));
  });

  it('filters and paginates the administrative user list', async () => {
    const users = [{ id: 'user-id', email: 'ana@example.com', roleCode: 'admin' }];
    query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce(users);

    await expect(service.listUsers({
      search: ' Ana ',
      roleCode: 'admin',
      active: true,
      page: 2,
      limit: 10,
    })).resolves.toEqual({ items: users, total: 1, page: 2, limit: 10 });

    expect(query.mock.calls[0][0]).toContain('u.correo_normalizado ILIKE $1');
    expect(query.mock.calls[0][1]).toEqual(['%Ana%', 'admin', true, 10, 10]);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('OFFSET $4 LIMIT $5'),
      ['%Ana%', 'admin', true, 10, 10],
    );
  });

  it('returns not found for a missing administrative user', async () => {
    query.mockResolvedValue([]);

    await expect(service.getUser('missing-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});
