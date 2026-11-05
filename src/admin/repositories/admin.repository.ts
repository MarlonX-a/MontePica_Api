import type { EntityManager } from 'typeorm';
import { OperationalLockRepository } from '../../database/repositories/operational-lock.repository.js';
import { ListAdminQueryDto } from '../dto/list-admin-query.dto.js';
// Read builders
const pageArgs = (query: ListAdminQueryDto) => ({
  page: query.page ?? 1,
  limit: query.limit ?? 20,
});
export interface ListRolesFindRolRow {
  id: string;
  code: string;
  name: string;
  permissions: boolean;
}
export interface ListUsersFindUsuarioRow {
  total: number;
}
export interface ListUsersFindUsuarioNextRow {
  id: string;
  email: string;
  active: boolean;
  roleCode: string;
  roleName: string;
  name: string;
  lastName: string;
  phone: string;
  clientId: string;
  createdAt: Date;
}
export interface GetUserFindUsuarioRow {
  id: string;
  email: string;
  active: boolean;
  roleCode: string;
  roleName: string;
  name: string;
  lastName: string;
  phone: string;
  clientId: string;
  createdAt: Date;
}
export interface CreateUserFindRolRow {
  id_rol: string;
}
export interface CreateUserInsertUsuarioRow {
  id_usuario: string;
}
export interface UpdateUserFindUsuarioRow {
  total: number;
}
export interface UpdateUserFindClienteRow {
  id_cliente: string;
}
export interface ListCategoriesFindCategoriaRow {
  total: number;
}
export interface ListCategoriesFindCategoriaNextRow {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  normalizedName: string;
}
export interface GetCategoryFindCategoriaRow {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  normalizedName: string;
}
export interface CreateCategoryInsertCategoriaRow {
  id_categoria: string;
}
export interface ListProductsFindProductoRow {
  total: number;
}
export interface ListProductsFindProductoNextRow {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  active: boolean;
  visibleInMenu: boolean;
  tracksInventory: boolean;
  sortOrder: number;
  categoryId: string;
  categoryName: string;
}
export interface GetProductFindProductoRow {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  active: boolean;
  visibleInMenu: boolean;
  tracksInventory: boolean;
  sortOrder: number;
  categoryId: string;
  categoryName: string;
}
export interface CreateProductFindCategoriaRow {
  id_categoria: string;
}
export interface CreateProductInsertProductoRow {
  id_producto: string;
}
export interface GetUserWithFindUsuarioRow {
  id: string;
  email: string;
  active: boolean;
  roleCode: string;
  roleName: string;
  name: string;
  lastName: string;
  phone: string;
  clientId: string;
  createdAt: Date;
}
export interface GetCategoryWithFindCategoriaRow {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  normalizedName: string;
}
export class AdminRepository {
  async listRolesFindRol(
    manager: EntityManager,
  ): Promise<ListRolesFindRolRow[]> {
    return manager.query<ListRolesFindRolRow[]>(
      `SELECT r.id_rol AS id, r.codigo AS code, r.nombre AS name,
      COALESCE(array_agg(p.codigo ORDER BY p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permissions
      FROM rol r LEFT JOIN rol_permiso rp ON rp.id_rol=r.id_rol LEFT JOIN permiso p ON p.id_permiso=rp.id_permiso
      GROUP BY r.id_rol ORDER BY r.codigo`,
      [],
    );
  }
  private async listUsersFindUsuario(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListUsersFindUsuarioRow[]> {
    return manager.query<ListUsersFindUsuarioRow[]>(
      `SELECT count(*)::int AS total FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN perfil pr ON pr.id_usuario=u.id_usuario ${fragment0}`,
      parameters,
    );
  }
  private async listUsersFindUsuarioNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
    fragment2: unknown,
  ): Promise<ListUsersFindUsuarioNextRow[]> {
    return manager.query<ListUsersFindUsuarioNextRow[]>(
      `SELECT u.id_usuario AS id, u.correo_normalizado AS email, u.activo AS active,
      r.codigo AS "roleCode", r.nombre AS "roleName", pr.nombres AS name, pr.apellidos AS "lastName", pr.telefono AS phone,
      c.id_cliente AS "clientId", u.creado_en AS "createdAt"
      FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN perfil pr ON pr.id_usuario=u.id_usuario
      LEFT JOIN cliente c ON c.id_usuario=u.id_usuario ${fragment0}
      ORDER BY pr.nombres, u.correo_normalizado, u.id_usuario OFFSET ${fragment1} LIMIT ${fragment2}`,
      parameters,
    );
  }
  async getUserFindUsuario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetUserFindUsuarioRow[]> {
    return manager.query<GetUserFindUsuarioRow[]>(
      `SELECT u.id_usuario AS id, u.correo_normalizado AS email, u.activo AS active,
      r.codigo AS "roleCode", r.nombre AS "roleName", pr.nombres AS name, pr.apellidos AS "lastName", pr.telefono AS phone,
      c.id_cliente AS "clientId", u.creado_en AS "createdAt" FROM usuario u JOIN rol r ON r.id_rol=u.id_rol
      JOIN perfil pr ON pr.id_usuario=u.id_usuario LEFT JOIN cliente c ON c.id_usuario=u.id_usuario WHERE u.id_usuario=$1`,
      [input.id],
    );
  }
  async createUserFindRol(
    manager: EntityManager,
    input: { roleCode: string },
  ): Promise<CreateUserFindRolRow[]> {
    return manager.query<CreateUserFindRolRow[]>(
      'SELECT id_rol FROM rol WHERE codigo=$1',
      [input.roleCode],
    );
  }
  async createUserInsertUsuario(
    manager: EntityManager,
    input: { id_rol: string; email: string; passwordHash: string },
  ): Promise<CreateUserInsertUsuarioRow[]> {
    return manager.query<CreateUserInsertUsuarioRow[]>(
      `INSERT INTO usuario(id_rol, correo_normalizado, password_hash, activo)
          VALUES($1,$2,$3,true) RETURNING id_usuario`,
      [input.id_rol, input.email, input.passwordHash],
    );
  }
  async createUserInsertPerfil(
    manager: EntityManager,
    input: { id: string; name: string; phone: string | null },
  ): Promise<void> {
    await manager.query(
      'INSERT INTO perfil(id_usuario,nombres,apellidos,telefono) VALUES($1,$2,NULL,$3)',
      [input.id, input.name, input.phone],
    );
  }
  async createUserInsertCliente(
    manager: EntityManager,
    input: { id: string; name: string; phone: string | null },
  ): Promise<void> {
    await manager.query(
      'INSERT INTO cliente(id_usuario,nombre_contacto,telefono) VALUES($1,$2,$3)',
      [input.id, input.name, input.phone],
    );
  }
  async updateUserFindUsuario(
    manager: EntityManager,
  ): Promise<UpdateUserFindUsuarioRow[]> {
    return manager.query<UpdateUserFindUsuarioRow[]>(
      `SELECT count(*)::int AS total FROM usuario u JOIN rol r ON r.id_rol=u.id_rol WHERE u.activo=true AND r.codigo='admin'`,
      [],
    );
  }
  async updateUserUpdateUsuario(
    manager: EntityManager,
    input: {
      id: string;
      email: string;
      id_rol: string;
      nextActive: boolean;
      accessVersionIncrement: 0 | 1;
    },
  ): Promise<void> {
    await manager.query(
      `UPDATE usuario SET correo_normalizado=$2,id_rol=$3,activo=$4,version_acceso=version_acceso+$5 WHERE id_usuario=$1`,
      [
        input.id,
        input.email,
        input.id_rol,
        input.nextActive,
        input.accessVersionIncrement,
      ],
    );
  }
  async updateUserUpdatePerfil(
    manager: EntityManager,
    input: { id: string; name: string; phone: string | null },
  ): Promise<void> {
    await manager.query(
      'UPDATE perfil SET nombres=$2,telefono=$3 WHERE id_usuario=$1',
      [input.id, input.name, input.phone],
    );
  }
  async updateUserFindCliente(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UpdateUserFindClienteRow[]> {
    return manager.query<UpdateUserFindClienteRow[]>(
      'SELECT id_cliente FROM cliente WHERE id_usuario=$1',
      [input.id],
    );
  }
  async updateUserUpdateCliente(
    manager: EntityManager,
    input: { id: string; name: string; phone: string | null },
  ): Promise<void> {
    await manager.query(
      'UPDATE cliente SET nombre_contacto=$2,telefono=$3 WHERE id_usuario=$1',
      [input.id, input.name, input.phone],
    );
  }
  async updateUserUpdateSesionUsuario(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager.query(
      'UPDATE sesion_usuario SET revocada_en=now() WHERE id_usuario=$1 AND revocada_en IS NULL',
      [input.id],
    );
  }
  private async listCategoriesFindCategoria(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListCategoriesFindCategoriaRow[]> {
    return manager.query<ListCategoriesFindCategoriaRow[]>(
      `SELECT count(*)::int total FROM categoria c ${fragment0}`,
      parameters,
    );
  }
  private async listCategoriesFindCategoriaNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
    fragment2: unknown,
  ): Promise<ListCategoriesFindCategoriaNextRow[]> {
    return manager.query<ListCategoriesFindCategoriaNextRow[]>(
      `SELECT c.id_categoria id,c.nombre name,c.activa active,c.orden "sortOrder",c.nombre_normalizado "normalizedName" FROM categoria c ${fragment0} ORDER BY c.orden,c.nombre,c.id_categoria OFFSET $${fragment1} LIMIT $${fragment2}`,
      parameters,
    );
  }
  async getCategoryFindCategoria(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetCategoryFindCategoriaRow[]> {
    return manager.query<GetCategoryFindCategoriaRow[]>(
      `SELECT id_categoria id,nombre name,activa active,orden "sortOrder",nombre_normalizado "normalizedName" FROM categoria WHERE id_categoria=$1`,
      [input.id],
    );
  }
  async createCategoryInsertCategoria(
    manager: EntityManager,
    input: {
      normalized: string;
      name: string;
      active: boolean;
      sortOrder: number;
    },
  ): Promise<CreateCategoryInsertCategoriaRow[]> {
    return manager.query<CreateCategoryInsertCategoriaRow[]>(
      `INSERT INTO categoria(nombre_normalizado,nombre,activa,orden) VALUES($1,$2,$3,$4) RETURNING id_categoria`,
      [input.normalized, input.name, input.active, input.sortOrder],
    );
  }
  async updateCategoryUpdateCategoria(
    manager: EntityManager,
    input: {
      id: string;
      name: string;
      normalized: string;
      active: boolean;
      sortOrder: number;
    },
  ): Promise<void> {
    await manager.query(
      'UPDATE categoria SET nombre=$2,nombre_normalizado=$3,activa=$4,orden=$5 WHERE id_categoria=$1',
      [input.id, input.name, input.normalized, input.active, input.sortOrder],
    );
  }
  private async listProductsFindProducto(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
  ): Promise<ListProductsFindProductoRow[]> {
    return manager.query<ListProductsFindProductoRow[]>(
      `SELECT count(*)::int total FROM producto p JOIN categoria c ON c.id_categoria=p.id_categoria ${fragment0}`,
      parameters,
    );
  }
  private async listProductsFindProductoNext(
    manager: EntityManager,
    parameters: unknown[],
    fragment0: unknown,
    fragment1: unknown,
    fragment2: unknown,
  ): Promise<ListProductsFindProductoNextRow[]> {
    return manager.query<ListProductsFindProductoNextRow[]>(
      `SELECT p.id_producto id,p.sku,p.nombre name,p.descripcion description,p.precio_ctvs "priceCents",p.imagen_url "imageUrl",p.activo active,p.visible_menu "visibleInMenu",p.controla_inventario "tracksInventory",p.orden "sortOrder",c.id_categoria "categoryId",c.nombre "categoryName" FROM producto p JOIN categoria c ON c.id_categoria=p.id_categoria ${fragment0} ORDER BY p.orden,p.nombre,p.id_producto OFFSET ${fragment1} LIMIT ${fragment2}`,
      parameters,
    );
  }
  async getProductFindProducto(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetProductFindProductoRow[]> {
    return manager.query<GetProductFindProductoRow[]>(
      `SELECT p.id_producto id,p.sku,p.nombre name,p.descripcion description,p.precio_ctvs "priceCents",p.imagen_url "imageUrl",p.activo active,p.visible_menu "visibleInMenu",p.controla_inventario "tracksInventory",p.orden "sortOrder",c.id_categoria "categoryId",c.nombre "categoryName" FROM producto p JOIN categoria c ON c.id_categoria=p.id_categoria WHERE p.id_producto=$1`,
      [input.id],
    );
  }
  async createProductFindCategoria(
    manager: EntityManager,
    input: { categoryId: string },
  ): Promise<CreateProductFindCategoriaRow[]> {
    return manager.query<CreateProductFindCategoriaRow[]>(
      'SELECT id_categoria FROM categoria WHERE id_categoria=$1',
      [input.categoryId],
    );
  }
  async createProductInsertProducto(
    manager: EntityManager,
    input: {
      categoryId: string;
      sku: string;
      name: string;
      description: string | null;
      priceCents: number;
      imageUrl: string | null;
      active: boolean;
      visibleInMenu: boolean;
      tracksInventory: boolean;
      sortOrder: number;
    },
  ): Promise<CreateProductInsertProductoRow[]> {
    return manager.query<CreateProductInsertProductoRow[]>(
      `INSERT INTO producto(id_categoria,sku,nombre,descripcion,precio_ctvs,imagen_url,activo,visible_menu,controla_inventario,orden) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_producto`,
      [
        input.categoryId,
        input.sku,
        input.name,
        input.description,
        input.priceCents,
        input.imageUrl,
        input.active,
        input.visibleInMenu,
        input.tracksInventory,
        input.sortOrder,
      ],
    );
  }
  async updateProductUpdateProducto(
    manager: EntityManager,
    input: {
      id: string;
      categoryId: string;
      name: string;
      description: string | null;
      priceCents: number;
      imageUrl: string | null;
      active: boolean;
      visibleInMenu: boolean;
      tracksInventory: boolean;
      sortOrder: number;
    },
  ): Promise<void> {
    await manager.query(
      `UPDATE producto SET id_categoria=$2,nombre=$3,descripcion=$4,precio_ctvs=$5,imagen_url=$6,activo=$7,visible_menu=$8,controla_inventario=$9,orden=$10 WHERE id_producto=$1`,
      [
        input.id,
        input.categoryId,
        input.name,
        input.description,
        input.priceCents,
        input.imageUrl,
        input.active,
        input.visibleInMenu,
        input.tracksInventory,
        input.sortOrder,
      ],
    );
  }
  async setVisibilityUpdateProducto(
    manager: EntityManager,
    input: { id: string; visible: boolean },
  ): Promise<void> {
    await manager.query(
      'UPDATE producto SET visible_menu=$2 WHERE id_producto=$1',
      [input.id, input.visible],
    );
  }
  async lockAdminMembershipFindOperation(
    manager: EntityManager,
  ): Promise<void> {
    await new OperationalLockRepository().acquireAdministratorMembership(
      manager,
    );
  }
  async getUserWithFindUsuario(
    manager: EntityManager,
    input: { id: string },
    lock: boolean,
  ): Promise<GetUserWithFindUsuarioRow[]> {
    return manager.query<GetUserWithFindUsuarioRow[]>(
      `SELECT u.id_usuario id,u.correo_normalizado email,u.activo active,r.codigo "roleCode",r.nombre "roleName",pr.nombres name,pr.apellidos "lastName",pr.telefono phone,c.id_cliente "clientId",u.creado_en "createdAt" FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN perfil pr ON pr.id_usuario=u.id_usuario LEFT JOIN cliente c ON c.id_usuario=u.id_usuario WHERE u.id_usuario=$1${lock ? ' FOR UPDATE OF u' : ''}`,
      [input.id],
    );
  }
  async getCategoryWithFindCategoria(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetCategoryWithFindCategoriaRow[]> {
    return manager.query<GetCategoryWithFindCategoriaRow[]>(
      'SELECT id_categoria id,nombre name,activa active,orden "sortOrder",nombre_normalizado "normalizedName" FROM categoria WHERE id_categoria=$1',
      [input.id],
    );
  }

  async listRoles(manager: EntityManager) {
    return this.listRolesFindRol(manager);
  }

  async listUsers(manager: EntityManager, query: ListAdminQueryDto) {
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
    const count = await this.listUsersFindUsuario(manager, params, where);
    const offset = bind((page - 1) * limit);
    const take = bind(limit);
    const items = await this.listUsersFindUsuarioNext(
      manager,
      params,
      where,
      offset,
      take,
    );
    return { items, total: count[0].total, page, limit };
  }

  async listCategories(manager: EntityManager, query: ListAdminQueryDto) {
    const { page, limit } = pageArgs(query);
    const args: unknown[] = [];
    const where: string[] = [];
    if (query.search?.trim()) {
      args.push(`%${query.search.trim()}%`);
      where.push(`c.nombre ILIKE $${args.length}`);
    }
    if (query.active !== undefined) {
      args.push(query.active);
      where.push(`c.activa=$${args.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await this.listCategoriesFindCategoria(manager, args, clause);
    args.push((page - 1) * limit, limit);
    const p = args.length - 1,
      l = args.length;
    const items = await this.listCategoriesFindCategoriaNext(
      manager,
      args,
      clause,
      p,
      l,
    );
    return { items, total: count[0].total, page, limit };
  }

  async listProducts(manager: EntityManager, query: ListAdminQueryDto) {
    const { page, limit } = pageArgs(query);
    const args: unknown[] = [];
    const f: string[] = [];
    const add = (v: unknown) => {
      args.push(v);
      return `$${args.length}`;
    };
    if (query.search?.trim()) {
      const p = add(`%${query.search.trim()}%`);
      f.push(
        `(p.nombre ILIKE ${p} OR p.descripcion ILIKE ${p} OR p.sku ILIKE ${p})`,
      );
    }
    if (query.categoryId) f.push(`p.id_categoria=${add(query.categoryId)}`);
    if (query.active !== undefined) f.push(`p.activo=${add(query.active)}`);
    if (query.visibleInMenu !== undefined)
      f.push(`p.visible_menu=${add(query.visibleInMenu)}`);
    const clause = f.length ? `WHERE ${f.join(' AND ')}` : '';
    const count = await this.listProductsFindProducto(manager, args, clause);
    const off = add((page - 1) * limit),
      lim = add(limit);
    const items = await this.listProductsFindProductoNext(
      manager,
      args,
      clause,
      off,
      lim,
    );
    return { items, total: count[0].total, page, limit };
  }
}
