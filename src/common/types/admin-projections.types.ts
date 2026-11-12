import { ListAdminQueryDto } from '../dto/list-admin-query.dto.js';

export const pageArgs = (query: ListAdminQueryDto) => ({
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
