import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { Permission } from '../../roles/entities/permission.entity.js';
import { RolePermission } from '../../roles/entities/role-permission.entity.js';
import { Role } from '../../roles/entities/role.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Client } from './entities/client.entity.js';

@Injectable()
export class PermissionLookupService {
  async forUser(manager: EntityManager, userId: string): Promise<string[]> {
    const rows = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select('p.codigo AS "codigo"')
      .innerJoin(RolePermission, 'rp', 'rp.id_rol=u.id_rol')
      .innerJoin(Permission, 'p', 'p.id_permiso=rp.id_permiso')
      .where('u.id_usuario=:userId AND u.activo=true')
      .setParameters({ userId })
      .getRawMany<{ codigo: string }>();
    return rows.map((row) => row.codigo);
  }

  async forRole(manager: EntityManager, roleId: string): Promise<string[]> {
    const rows = await manager
      .getRepository(Permission)
      .createQueryBuilder('p')
      .select('p.codigo AS "codigo"')
      .innerJoin(RolePermission, 'rp', 'rp.id_permiso=p.id_permiso')
      .where('rp.id_rol=:roleId')
      .addOrderBy('p.codigo', 'ASC')
      .setParameters({ roleId })
      .getRawMany<{ codigo: string }>();
    return rows.map((row) => row.codigo);
  }

  async clientIdentity(
    manager: EntityManager,
    userId: string,
  ): Promise<{ clientId: string | null; roleCode: string } | undefined> {
    const [row] = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select(['c.id_cliente AS "clientId"', 'r.codigo AS "roleCode"'])
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .leftJoin(Client, 'c', 'c.id_usuario=u.id_usuario')
      .where('u.id_usuario=:userId AND u.activo=true')
      .setParameters({ userId })
      .getRawMany();
    return row;
  }
}
