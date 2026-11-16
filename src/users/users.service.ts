import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { UserSession } from '../auth/entities/user-session.entity.js';
import {
  hashPassword,
  normalizeEmail,
  normalizePhone,
} from '../auth/password.util.js';
import { AuditService } from '../common/audit/audit.service.js';
import { throwConflictIfUnique } from '../common/database/unique-conflict.js';
import { ListAdminQueryDto } from '../common/dto/list-admin-query.dto.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { TransactionLocksService } from '../common/transactions/transaction-locks.service.js';
import {
  CreateUserFindRolRow,
  CreateUserInsertUsuarioRow,
  GetUserFindUsuarioRow,
  GetUserWithFindUsuarioRow,
  pageArgs,
  UpdateUserFindClienteRow,
  UpdateUserFindUsuarioRow,
} from '../common/types/admin-projections.types.js';
import { Role } from '../roles/entities/role.entity.js';
import { CreateAdminUserDto } from './dto/create-admin-user.dto.js';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto.js';
import { Profile } from './entities/profile.entity.js';
import { User } from './entities/user.entity.js';

type Actor = AuthenticatedRequestContext | null;

const cleanName = (value: string) => {
  const name = value.trim().normalize('NFC').replace(/\s+/g, ' ');
  if (!name) throw new BadRequestException('El nombre no puede estar vacío.');
  return name;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly records: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly auditRecords: AuditService,
    private readonly locks: TransactionLocksService,
  ) {}

  async listUsers(query: ListAdminQueryDto) {
    return this.queryListUsers(this.records.manager, query);
  }

  async getUser(id: string) {
    const result = await this.getUserFindUsuario(this.records.manager, {
      id,
    });
    if (!result[0]) throw new NotFoundException('Usuario no encontrado.');
    return result[0];
  }

  async createUser(dto: CreateAdminUserDto, actor: Actor) {
    const email = normalizeEmail(dto.email);
    const passwordHash = await hashPassword(dto.initialPassword);
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    try {
      return await this.dataSource.transaction(async (manager) => {
        if (dto.roleCode === 'admin') await this.lockAdminMembership(manager);
        const rows = await this.createUserFindRol(manager, {
          roleCode: dto.roleCode,
        });
        if (!rows[0])
          throw new BadRequestException('El rol solicitado no existe.');
        const inserted = await this.createUserInsertUsuario(manager, {
          id_rol: rows[0].id_rol,
          email,
          passwordHash,
        });
        const id = inserted[0].id_usuario;
        await this.createUserInsertPerfil(manager, {
          id,
          name: cleanName(dto.name),
          phone,
        });
        if (dto.roleCode === 'client')
          await this.createUserInsertCliente(manager, {
            id,
            name: cleanName(dto.name),
            phone,
          });
        const response = await this.getUserWith(manager, id);
        await this.auditRecords.appendChange(
          manager,
          actor,
          'usuario',
          id,
          'users.created',
          {},
          this.safeUserSnapshot(response),
        );
        return response;
      });
    } catch (error) {
      throwConflictIfUnique(error, 'Ya existe una cuenta con ese correo.');
      throw error;
    }
  }

  async updateUser(
    id: string,
    dto: UpdateAdminUserDto,
    actor: AuthenticatedRequestContext,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Take the shared lock before the user row so simultaneous admin changes cannot deadlock.
        await this.lockAdminMembership(manager);
        const current = await this.getUserWith(manager, id, true);
        const nextRole = dto.roleCode ?? current.roleCode;
        const nextActive = dto.active ?? current.active;
        if (
          actor.userId === id &&
          ((dto.roleCode !== undefined && dto.roleCode !== current.roleCode) ||
            dto.active === false)
        ) {
          throw new ConflictException(
            'No puedes cambiar tu propio rol ni suspender tu cuenta.',
          );
        }
        if (
          current.roleCode === 'admin' &&
          current.active &&
          (!nextActive || nextRole !== 'admin')
        ) {
          const count = await this.updateUserFindUsuario(manager);
          if (count[0].total <= 1)
            throw new ConflictException(
              'No se puede modificar al último administrador activo.',
            );
        }
        const role = await this.createUserFindRol(manager, {
          roleCode: nextRole,
        });
        if (!role[0])
          throw new BadRequestException('El rol solicitado no existe.');
        const email =
          dto.email === undefined ? current.email : normalizeEmail(dto.email);
        const phone = this.updatedPhone(dto.phone, current.phone);
        const name =
          dto.name === undefined ? current.name : cleanName(dto.name);
        const sensitive =
          email !== current.email ||
          nextRole !== current.roleCode ||
          nextActive !== current.active;
        await this.updateUserUpdateUsuario(manager, {
          id,
          email,
          id_rol: role[0].id_rol,
          nextActive,
          accessVersionIncrement: sensitive ? 1 : 0,
        });
        await this.updateUserUpdatePerfil(manager, {
          id,
          name,
          phone,
        });
        const client = await this.updateUserFindCliente(manager, {
          id,
        });
        if (nextRole === 'client' && !client[0])
          await this.createUserInsertCliente(manager, {
            id,
            name,
            phone,
          });
        else if (client[0])
          await this.updateUserUpdateCliente(manager, {
            id,
            name,
            phone,
          });
        if (sensitive)
          await this.updateUserUpdateSesionUsuario(manager, {
            id,
          });
        const updated = await this.getUserWith(manager, id);
        await this.auditRecords.appendChange(
          manager,
          actor,
          'usuario',
          id,
          'users.updated',
          this.safeUserSnapshot(current),
          this.safeUserSnapshot(updated),
        );
        return updated;
      });
    } catch (error) {
      throwConflictIfUnique(error, 'Ya existe una cuenta con ese correo.');
      throw error;
    }
  }

  private async lockAdminMembership(manager: import('typeorm').EntityManager) {
    await this.lockAdminMembershipFindOperation(manager);
  }

  private async getUserWith(
    manager: import('typeorm').EntityManager,
    id: string,
    lock = false,
  ) {
    const rows = await this.getUserWithFindUsuario(manager, { id }, lock);
    if (!rows[0]) throw new NotFoundException('Usuario no encontrado.');
    return rows[0];
  }

  private safeUserSnapshot(u: {
    id: string;
    email: string;
    active: boolean;
    roleCode: string;
    name: string;
    lastName: string | null;
    phone: string | null;
    clientId: string | null;
  }) {
    return {
      id: u.id,
      email: u.email,
      active: u.active,
      roleCode: u.roleCode,
      name: u.name,
      lastName: u.lastName,
      phone: u.phone,
      clientId: u.clientId,
    };
  }

  private getUserFindUsuario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetUserFindUsuarioRow[]> {
    return manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select([
        'u.id_usuario AS id',
        'u.correo_normalizado AS email',
        'u.activo AS active',
        'r.codigo AS "roleCode"',
        'r.nombre AS "roleName"',
        'pr.nombres AS name',
        'pr.apellidos AS "lastName"',
        'pr.telefono AS phone',
        'c.id_cliente AS "clientId"',
        'u.creado_en AS "createdAt"',
      ])
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .innerJoin(Profile, 'pr', 'pr.id_usuario=u.id_usuario')
      .leftJoin(Client, 'c', 'c.id_usuario=u.id_usuario')
      .where('u.id_usuario=:id')
      .setParameters({ id: input.id })
      .getRawMany<GetUserFindUsuarioRow>();
  }

  private createUserFindRol(
    manager: EntityManager,
    input: { roleCode: string },
  ): Promise<CreateUserFindRolRow[]> {
    return manager
      .getRepository(Role)
      .createQueryBuilder('rol')
      .select('id_rol AS "id_rol"')
      .where('codigo=:roleCode')
      .setParameters({ roleCode: input.roleCode })
      .getRawMany<CreateUserFindRolRow>();
  }

  private createUserInsertUsuario(
    manager: EntityManager,
    input: { id_rol: string; email: string; passwordHash: string },
  ): Promise<CreateUserInsertUsuarioRow[]> {
    return manager
      .getRepository(User)
      .createQueryBuilder()
      .insert()
      .values([
        {
          role: { id: input.id_rol },
          normalizedEmail: input.email,
          passwordHash: input.passwordHash,
          active: true,
        },
      ])
      .returning('id_usuario')
      .execute()
      .then((result) => result.raw);
  }

  private async createUserInsertPerfil(
    manager: EntityManager,
    input: { id: string; name: string; phone: string | null },
  ): Promise<void> {
    await manager
      .getRepository(Profile)
      .createQueryBuilder()
      .insert()
      .values([
        {
          userId: input.id,
          names: input.name,
          lastNames: null,
          phone: input.phone,
        },
      ])
      .execute();
  }

  private async createUserInsertCliente(
    manager: EntityManager,
    input: { id: string; name: string; phone: string | null },
  ): Promise<void> {
    await manager
      .getRepository(Client)
      .createQueryBuilder()
      .insert()
      .values([
        { userId: input.id, contactName: input.name, phone: input.phone },
      ])
      .execute();
  }

  private updateUserFindUsuario(
    manager: EntityManager,
  ): Promise<UpdateUserFindUsuarioRow[]> {
    return manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select('count(*)::int AS total')
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .where("u.activo=true AND r.codigo='admin'")
      .getRawMany<UpdateUserFindUsuarioRow>();
  }

  private async updateUserUpdateUsuario(
    manager: EntityManager,
    input: {
      id: string;
      email: string;
      id_rol: string;
      nextActive: boolean;
      accessVersionIncrement: 0 | 1;
    },
  ): Promise<void> {
    await manager
      .getRepository(User)
      .createQueryBuilder()
      .update(User)
      .set({
        normalizedEmail: input.email,
        role: { id: input.id_rol },
        active: input.nextActive,
        accessVersion: () => 'version_acceso+:accessVersionIncrement',
      })
      .where('id_usuario=:id')
      .setParameters({
        id: input.id,
        accessVersionIncrement: input.accessVersionIncrement,
      })
      .execute();
  }

  private async updateUserUpdatePerfil(
    manager: EntityManager,
    input: { id: string; name: string; phone: string | null },
  ): Promise<void> {
    await manager
      .getRepository(Profile)
      .createQueryBuilder()
      .update(Profile)
      .set({ names: input.name, phone: input.phone })
      .where('id_usuario=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private updateUserFindCliente(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UpdateUserFindClienteRow[]> {
    return manager
      .getRepository(Client)
      .createQueryBuilder('cliente')
      .select('id_cliente AS "id_cliente"')
      .where('id_usuario=:id')
      .setParameters({ id: input.id })
      .getRawMany<UpdateUserFindClienteRow>();
  }

  private async updateUserUpdateCliente(
    manager: EntityManager,
    input: { id: string; name: string; phone: string | null },
  ): Promise<void> {
    await manager
      .getRepository(Client)
      .createQueryBuilder()
      .update(Client)
      .set({ contactName: input.name, phone: input.phone })
      .where('id_usuario=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async updateUserUpdateSesionUsuario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(UserSession)
      .createQueryBuilder()
      .update(UserSession)
      .set({ revokedAt: () => 'now()' })
      .where('id_usuario=:id AND revocada_en IS NULL')
      .setParameters({ id: input.id })
      .execute();
  }

  private async lockAdminMembershipFindOperation(
    manager: EntityManager,
  ): Promise<void> {
    await this.locks.acquireAdministratorMembership(manager);
  }

  private getUserWithFindUsuario(
    manager: EntityManager,
    input: { id: string },
    lock: boolean,
  ): Promise<GetUserWithFindUsuarioRow[]> {
    return manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select(
        'u.id_usuario id, u.correo_normalizado email, u.activo active, r.codigo "roleCode", r.nombre "roleName", pr.nombres name, pr.apellidos "lastName", pr.telefono phone, c.id_cliente "clientId", u.creado_en "createdAt"',
      )
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .innerJoin(Profile, 'pr', 'pr.id_usuario=u.id_usuario')
      .leftJoin(Client, 'c', 'c.id_usuario=u.id_usuario')
      .where(
        (
          'u.id_usuario=:id' +
          String(lock ? ' FOR UPDATE OF u' : '') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .setParameters({ id: input.id })
      .getRawMany<GetUserWithFindUsuarioRow>();
  }

  private async queryListUsers(
    manager: EntityManager,
    query: ListAdminQueryDto,
  ) {
    const { page, limit } = pageArgs(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (query.search?.trim()) {
      const p = bind(`%${query.search.trim()}%`);
      filters.push(
        `(u.correo_normalizado ILIKE ${p} OR (pr.nombres || ' ' || COALESCE(pr.apellidos,'')) ILIKE ${p})`,
      );
    }
    if (query.roleCode) filters.push(`r.codigo=${bind(query.roleCode)}`);
    if (query.active !== undefined)
      filters.push(`u.activo=${bind(query.active)}`);
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const queryValues1: unknown[] = params;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const count = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select('count(*)::int AS total')
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .innerJoin(Profile, 'pr', 'pr.id_usuario=u.id_usuario')
      .where(
        (
          '' +
          String(String(where).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const offset = bind((page - 1) * limit);
    const take = bind(limit);
    const queryValues2: unknown[] = params;
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select([
        'u.id_usuario AS id',
        'u.correo_normalizado AS email',
        'u.activo AS active',
        'r.codigo AS "roleCode"',
        'r.nombre AS "roleName"',
        'pr.nombres AS name',
        'pr.apellidos AS "lastName"',
        'pr.telefono AS phone',
        'c.id_cliente AS "clientId"',
        'u.creado_en AS "createdAt"',
      ])
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .innerJoin(Profile, 'pr', 'pr.id_usuario=u.id_usuario')
      .leftJoin(Client, 'c', 'c.id_usuario=u.id_usuario')
      .where(
        (
          '' +
          String(String(where).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .addOrderBy('pr.nombres', 'ASC')
      .addOrderBy('u.correo_normalizado', 'ASC')
      .addOrderBy('u.id_usuario', 'ASC')
      .limit(Number(queryValues2[Number(String(take).replace('$', '')) - 1]))
      .offset(Number(queryValues2[Number(String(offset).replace('$', '')) - 1]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total: count[0].total, page, limit };
  }
  private updatedPhone(
    value: string | null | undefined,
    current: string | null,
  ): string | null {
    if (value === undefined) return current;
    if (value === null) return null;
    return normalizePhone(value);
  }
}
