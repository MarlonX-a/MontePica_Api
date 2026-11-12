import { NotFoundException } from '@nestjs/common';
import { type DataSource, type Repository } from 'typeorm';
import { createQueryManager } from '../../test/support/query-builder.js';
import { Role } from '../roles/entities/role.entity.js';
import { RolesService } from '../roles/roles.service.js';
import { User } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

describe('User and role queries', () => {
  it('returns the role permission projection', async () => {
    const f = createQueryManager(),
      rows = [{ id: 'role', code: 'admin', permissions: ['users.read'] }];
    f.reads.push(rows);
    const service = new RolesService({
      manager: f.manager,
    } as Repository<Role>);
    await expect(service.listRoles()).resolves.toEqual(rows);
  });
  it('preserves user filters and pagination', async () => {
    const f = createQueryManager();
    f.reads.push([{ total: 1 }], [{ id: 'user', name: 'Ana' }]);
    const service = new UsersService(
      { manager: f.manager } as Repository<User>,
      {} as DataSource,
      {} as never,
      {} as never,
    );
    await expect(
      service.listUsers({
        search: 'Ana',
        roleCode: 'admin',
        active: true,
        page: 2,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      items: [{ id: 'user', name: 'Ana' }],
      total: 1,
      page: 2,
      limit: 10,
    });
    expect(
      f.builders.some((b) =>
        b.offset.mock.calls.some(([offset]) => offset === 10),
      ),
    ).toBe(true);
  });
  it('reports a missing user', async () => {
    const f = createQueryManager();
    f.reads.push([]);
    const service = new UsersService(
      { manager: f.manager } as Repository<User>,
      {} as DataSource,
      {} as never,
      {} as never,
    );
    await expect(service.getUser('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
