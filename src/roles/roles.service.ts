import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { ListRolesFindRolRow } from '../common/types/admin-projections.types.js';
import { Permission } from './entities/permission.entity.js';
import { RolePermission } from './entities/role-permission.entity.js';
import { Role } from './entities/role.entity.js';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly records: Repository<Role>,
  ) {}

  async listRoles() {
    return this.queryListRoles(this.records.manager);
  }

  private async listRolesFindRol(
    manager: EntityManager,
  ): Promise<ListRolesFindRolRow[]> {
    return manager
      .getRepository(Role)
      .createQueryBuilder('r')
      .select([
        'r.id_rol AS id',
        'r.codigo AS code',
        'r.nombre AS name',
        "COALESCE(array_agg(p.codigo ORDER BY p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permissions",
      ])
      .leftJoin(RolePermission, 'rp', 'rp.id_rol=r.id_rol')
      .leftJoin(Permission, 'p', 'p.id_permiso=rp.id_permiso')
      .groupBy('r.id_rol')
      .addOrderBy('r.codigo', 'ASC')
      .getRawMany<ListRolesFindRolRow>();
  }

  private async queryListRoles(manager: EntityManager) {
    return this.listRolesFindRol(manager);
  }
}
