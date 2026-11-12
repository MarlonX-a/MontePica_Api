import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { TransactionLocksService } from '../common/transactions/transaction-locks.service.js';
import { Role } from '../roles/entities/role.entity.js';
import { Profile } from './entities/profile.entity.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class BootstrapService {
  constructor(private readonly locks: TransactionLocksService) {}

  async lockAdministratorCreation(manager: EntityManager): Promise<void> {
    await this.locks.acquireAdministratorMembership(manager);
  }

  async countAdministrators(manager: EntityManager): Promise<number> {
    const [row] = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select('count(*)::int AS total')
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .where("r.codigo='admin'")
      .getRawMany();
    return row.total;
  }

  async emailExists(manager: EntityManager, email: string): Promise<boolean> {
    const rows = await manager
      .getRepository(User)
      .createQueryBuilder('usuario')
      .select('1 AS exists')
      .where('correo_normalizado=:email')
      .setParameters({ email })
      .getRawMany();
    return rows.length > 0;
  }

  async findAdministratorRole(
    manager: EntityManager,
  ): Promise<string | undefined> {
    const [row] = await manager
      .getRepository(Role)
      .createQueryBuilder('rol')
      .select('id_rol AS "id_rol"')
      .where("codigo='admin'")
      .getRawMany();
    return row?.id_rol;
  }

  async insertAdministrator(
    manager: EntityManager,
    roleId: string,
    email: string,
    passwordHash: string,
  ): Promise<string> {
    const [row] = await manager
      .getRepository(User)
      .createQueryBuilder()
      .insert()
      .values([
        {
          role: { id: roleId },
          normalizedEmail: email,
          passwordHash,
          active: true,
        },
      ])
      .returning('id_usuario')
      .execute()
      .then((result) => result.raw);
    return row.id_usuario;
  }

  async insertProfile(
    manager: EntityManager,
    id: string,
    name: string,
    phone: string | null,
  ): Promise<void> {
    await manager
      .getRepository(Profile)
      .createQueryBuilder()
      .insert()
      .values([{ userId: id, names: name, lastNames: null, phone }])
      .execute();
  }
}
