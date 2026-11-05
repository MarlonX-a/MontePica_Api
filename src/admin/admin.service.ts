import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuthenticatedRequestContext } from '../auth/auth.types.js';
import {
  hashPassword,
  normalizeEmail,
  normalizePhone,
} from '../auth/password.util.js';
import { AuditRepository } from '../database/repositories/audit.repository.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';
import { ListAdminQueryDto } from './dto/list-admin-query.dto.js';
import {
  CreateAdminProductDto,
  UpdateAdminProductDto,
} from './dto/product.dto.js';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/user.dto.js';
import { AdminRepository } from './repositories/admin.repository.js';

type Actor = AuthenticatedRequestContext | null;
const cleanName = (value: string) => {
  const name = value.trim().normalize('NFC').replace(/\s+/g, ' ');
  if (!name) throw new BadRequestException('El nombre no puede estar vacío.');
  return name;
};
const normalizeCategory = (value: string) => cleanName(value).toLowerCase();
const normalizeSku = (value: string) =>
  value.trim().normalize('NFC').toLowerCase();

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly persistence: AdminRepository = new AdminRepository(),
    private readonly auditRecords: AuditRepository = new AuditRepository(),
  ) {}

  async listRoles() {
    return this.persistence.listRoles(this.dataSource.manager);
  }

  async listUsers(query: ListAdminQueryDto) {
    return this.persistence.listUsers(this.dataSource.manager, query);
  }

  async getUser(id: string) {
    const result = await this.persistence.getUserFindUsuario(
      this.dataSource.manager,
      { id: id },
    );
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
        const rows = await this.persistence.createUserFindRol(manager, {
          roleCode: dto.roleCode,
        });
        if (!rows[0])
          throw new BadRequestException('El rol solicitado no existe.');
        const inserted = await this.persistence.createUserInsertUsuario(
          manager,
          { id_rol: rows[0].id_rol, email: email, passwordHash: passwordHash },
        );
        const id = inserted[0].id_usuario;
        await this.persistence.createUserInsertPerfil(manager, {
          id: id,
          name: cleanName(dto.name),
          phone: phone,
        });
        if (dto.roleCode === 'client')
          await this.persistence.createUserInsertCliente(manager, {
            id: id,
            name: cleanName(dto.name),
            phone: phone,
          });
        const response = await this.getUserWith(manager, id);
        await this.audit(
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
      this.handleUnique(error, 'Ya existe una cuenta con ese correo.');
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
          const count = await this.persistence.updateUserFindUsuario(manager);
          if (count[0].total <= 1)
            throw new ConflictException(
              'No se puede modificar al último administrador activo.',
            );
        }
        const role = await this.persistence.createUserFindRol(manager, {
          roleCode: nextRole,
        });
        if (!role[0])
          throw new BadRequestException('El rol solicitado no existe.');
        const email =
          dto.email === undefined ? current.email : normalizeEmail(dto.email);
        const phone =
          dto.phone === undefined
            ? current.phone
            : dto.phone === null
              ? null
              : normalizePhone(dto.phone);
        const name =
          dto.name === undefined ? current.name : cleanName(dto.name);
        const sensitive =
          email !== current.email ||
          nextRole !== current.roleCode ||
          nextActive !== current.active;
        await this.persistence.updateUserUpdateUsuario(manager, {
          id: id,
          email: email,
          id_rol: role[0].id_rol,
          nextActive: nextActive,
          accessVersionIncrement: sensitive ? 1 : 0,
        });
        await this.persistence.updateUserUpdatePerfil(manager, {
          id: id,
          name: name,
          phone: phone,
        });
        const client = await this.persistence.updateUserFindCliente(manager, {
          id: id,
        });
        if (nextRole === 'client' && !client[0])
          await this.persistence.createUserInsertCliente(manager, {
            id: id,
            name: name,
            phone: phone,
          });
        else if (client[0])
          await this.persistence.updateUserUpdateCliente(manager, {
            id: id,
            name: name,
            phone: phone,
          });
        if (sensitive)
          await this.persistence.updateUserUpdateSesionUsuario(manager, {
            id: id,
          });
        const updated = await this.getUserWith(manager, id);
        await this.audit(
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
      this.handleUnique(error, 'Ya existe una cuenta con ese correo.');
      throw error;
    }
  }

  async listCategories(query: ListAdminQueryDto) {
    return this.persistence.listCategories(this.dataSource.manager, query);
  }
  async getCategory(id: string) {
    const r = await this.persistence.getCategoryFindCategoria(
      this.dataSource.manager,
      { id: id },
    );
    if (!r[0]) throw new NotFoundException('Categoría no encontrada.');
    return r[0];
  }
  async createCategory(
    dto: CreateCategoryDto,
    actor: AuthenticatedRequestContext,
  ) {
    const name = cleanName(dto.name),
      normalized = normalizeCategory(dto.name);
    if (!name || normalized === 'todos')
      throw new BadRequestException('El nombre está vacío o reservado.');
    try {
      return await this.dataSource.transaction(async (m) => {
        const r = await this.persistence.createCategoryInsertCategoria(m, {
          normalized: normalized,
          name: name,
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
        });
        const id = r[0].id_categoria;
        const item = await this.getCategoryWith(m, id);
        await this.audit(
          m,
          actor,
          'categoria',
          id,
          'catalog.category_created',
          {},
          item,
        );
        return item;
      });
    } catch (e) {
      this.handleUnique(e, 'Ya existe una categoría con ese nombre.');
      throw e;
    }
  }
  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    actor: AuthenticatedRequestContext,
  ) {
    try {
      return await this.dataSource.transaction(async (m) => {
        const before = await this.getCategoryWith(m, id);
        const name = dto.name === undefined ? before.name : cleanName(dto.name);
        const normalized =
          dto.name === undefined
            ? before.normalizedName
            : normalizeCategory(dto.name);
        if (!name || normalized === 'todos')
          throw new BadRequestException('El nombre está vacío o reservado.');
        await this.persistence.updateCategoryUpdateCategoria(m, {
          id: id,
          name: name,
          normalized: normalized,
          active: dto.active ?? before.active,
          sortOrder: dto.sortOrder ?? before.sortOrder,
        });
        const after = await this.getCategoryWith(m, id);
        await this.audit(
          m,
          actor,
          'categoria',
          id,
          'catalog.category_updated',
          before,
          after,
        );
        return after;
      });
    } catch (e) {
      this.handleUnique(e, 'Ya existe una categoría con ese nombre.');
      throw e;
    }
  }

  async listProducts(query: ListAdminQueryDto) {
    return this.persistence.listProducts(this.dataSource.manager, query);
  }
  async getProduct(id: string) {
    const r = await this.persistence.getProductFindProducto(
      this.dataSource.manager,
      { id: id },
    );
    if (!r[0]) throw new NotFoundException('Producto no encontrado.');
    return r[0];
  }
  async createProduct(
    dto: CreateAdminProductDto,
    actor: AuthenticatedRequestContext,
  ) {
    const sku = normalizeSku(dto.sku);
    if (!sku) throw new BadRequestException('El SKU no puede estar vacío.');
    try {
      return await this.dataSource.transaction(async (m) => {
        const cat = await this.persistence.createProductFindCategoria(m, {
          categoryId: dto.categoryId,
        });
        if (!cat[0]) throw new BadRequestException('La categoría no existe.');
        const r = await this.persistence.createProductInsertProducto(m, {
          categoryId: dto.categoryId,
          sku: sku,
          name: cleanName(dto.name),
          description: dto.description ?? null,
          priceCents: dto.priceCents,
          imageUrl: dto.imageUrl ?? null,
          active: dto.active ?? true,
          visibleInMenu: dto.visibleInMenu ?? true,
          tracksInventory: dto.tracksInventory ?? true,
          sortOrder: dto.sortOrder ?? 0,
        });
        const id = r[0].id_producto;
        const after = await this.getProductWith(m, id);
        await this.audit(
          m,
          actor,
          'producto',
          id,
          'catalog.product_created',
          {},
          after,
        );
        return after;
      });
    } catch (e) {
      this.handleUnique(e, 'Ya existe un producto con ese SKU.');
      throw e;
    }
  }
  async updateProduct(
    id: string,
    dto: UpdateAdminProductDto,
    actor: AuthenticatedRequestContext,
  ) {
    try {
      return await this.dataSource.transaction(async (m) => {
        const before = await this.getProductWith(m, id);
        if (dto.categoryId) {
          const c = await this.persistence.createProductFindCategoria(m, {
            categoryId: dto.categoryId,
          });
          if (!c[0]) throw new BadRequestException('La categoría no existe.');
        }
        await this.persistence.updateProductUpdateProducto(m, {
          id: id,
          categoryId: dto.categoryId ?? before.categoryId,
          name: dto.name === undefined ? before.name : cleanName(dto.name),
          description:
            dto.description === undefined
              ? before.description
              : dto.description,
          priceCents: dto.priceCents ?? before.priceCents,
          imageUrl: dto.imageUrl === undefined ? before.imageUrl : dto.imageUrl,
          active: dto.active ?? before.active,
          visibleInMenu: dto.visibleInMenu ?? before.visibleInMenu,
          tracksInventory: dto.tracksInventory ?? before.tracksInventory,
          sortOrder: dto.sortOrder ?? before.sortOrder,
        });
        const after = await this.getProductWith(m, id);
        await this.audit(
          m,
          actor,
          'producto',
          id,
          'catalog.product_updated',
          before,
          after,
        );
        return after;
      });
    } catch (e) {
      this.handleUnique(e, 'Conflicto al guardar el producto.');
      throw e;
    }
  }
  async setVisibility(
    id: string,
    visible: boolean,
    actor: AuthenticatedRequestContext,
  ) {
    return this.dataSource.transaction(async (m) => {
      const before = await this.getProductWith(m, id);
      await this.persistence.setVisibilityUpdateProducto(m, {
        id: id,
        visible: visible,
      });
      const after = await this.getProductWith(m, id);
      await this.audit(
        m,
        actor,
        'producto',
        id,
        'catalog.product_visibility_changed',
        before,
        after,
      );
      return after;
    });
  }

  private async lockAdminMembership(manager: import('typeorm').EntityManager) {
    await this.persistence.lockAdminMembershipFindOperation(manager);
  }
  private async getUserWith(
    manager: import('typeorm').EntityManager,
    id: string,
    lock = false,
  ) {
    const rows = await this.persistence.getUserWithFindUsuario(
      manager,
      { id: id },
      lock,
    );
    if (!rows[0]) throw new NotFoundException('Usuario no encontrado.');
    return rows[0];
  }
  private async getCategoryWith(
    m: import('typeorm').EntityManager,
    id: string,
  ) {
    const r = await this.persistence.getCategoryWithFindCategoria(m, {
      id: id,
    });
    if (!r[0]) throw new NotFoundException('Categoría no encontrada.');
    return r[0];
  }
  private async getProductWith(m: import('typeorm').EntityManager, id: string) {
    const r = await this.persistence.getProductFindProducto(m, { id: id });
    if (!r[0]) throw new NotFoundException('Producto no encontrado.');
    return r[0];
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
  private async audit(
    m: import('typeorm').EntityManager,
    actor: Actor,
    type: string,
    id: string,
    event: string,
    before: unknown,
    after: unknown,
  ) {
    await this.auditRecords.append(
      m,
      actor ?? {},
      type,
      id,
      event,
      { before, after },
      'sistema',
    );
  }
  private handleUnique(error: unknown, message: string) {
    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    )
      throw new ConflictException(message);
  }
}
