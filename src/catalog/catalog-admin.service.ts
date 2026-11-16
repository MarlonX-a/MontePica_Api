import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AuditService } from '../common/audit/audit.service.js';
import { throwConflictIfUnique } from '../common/database/unique-conflict.js';
import { ListAdminQueryDto } from '../common/dto/list-admin-query.dto.js';
import {
  CreateCategoryInsertCategoriaRow,
  CreateProductFindCategoriaRow,
  CreateProductInsertProductoRow,
  GetCategoryFindCategoriaRow,
  GetCategoryWithFindCategoriaRow,
  GetProductFindProductoRow,
  pageArgs,
} from '../common/types/admin-projections.types.js';
import { CreateAdminProductDto } from './dto/create-admin-product.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateAdminProductDto } from './dto/update-admin-product.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { Category } from './entities/category.entity.js';
import { Product } from './entities/product.entity.js';

const cleanName = (value: string) => {
  const name = value.trim().normalize('NFC').replace(/\s+/g, ' ');
  if (!name) throw new BadRequestException('El nombre no puede estar vacío.');
  return name;
};

const normalizeCategory = (value: string) => cleanName(value).toLowerCase();

const normalizeSku = (value: string) =>
  value.trim().normalize('NFC').toLowerCase();

@Injectable()
export class CatalogAdminService {
  constructor(
    @InjectRepository(Product) private readonly records: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly auditRecords: AuditService,
  ) {}

  async listCategories(query: ListAdminQueryDto) {
    return this.queryListCategories(this.records.manager, query);
  }

  async getCategory(id: string) {
    const r = await this.getCategoryFindCategoria(this.records.manager, {
      id,
    });
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
        const r = await this.createCategoryInsertCategoria(m, {
          normalized,
          name,
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
        });
        const id = r[0].id_categoria;
        const item = await this.getCategoryWith(m, id);
        await this.auditRecords.appendChange(
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
      throwConflictIfUnique(e, 'Ya existe una categoría con ese nombre.');
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
        await this.updateCategoryUpdateCategoria(m, {
          id,
          name,
          normalized,
          active: dto.active ?? before.active,
          sortOrder: dto.sortOrder ?? before.sortOrder,
        });
        const after = await this.getCategoryWith(m, id);
        await this.auditRecords.appendChange(
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
      throwConflictIfUnique(e, 'Ya existe una categoría con ese nombre.');
      throw e;
    }
  }

  async listProducts(query: ListAdminQueryDto) {
    return this.queryListProducts(this.records.manager, query);
  }

  async getProduct(id: string) {
    const r = await this.getProductFindProducto(this.records.manager, {
      id,
    });
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
        const cat = await this.createProductFindCategoria(m, {
          categoryId: dto.categoryId,
        });
        if (!cat[0]) throw new BadRequestException('La categoría no existe.');
        const r = await this.createProductInsertProducto(m, {
          categoryId: dto.categoryId,
          sku,
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
        await this.auditRecords.appendChange(
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
      throwConflictIfUnique(e, 'Ya existe un producto con ese SKU.');
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
          const c = await this.createProductFindCategoria(m, {
            categoryId: dto.categoryId,
          });
          if (!c[0]) throw new BadRequestException('La categoría no existe.');
        }
        await this.updateProductUpdateProducto(m, {
          id,
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
        await this.auditRecords.appendChange(
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
      throwConflictIfUnique(e, 'Conflicto al guardar el producto.');
      throw e;
    }
  }

  setVisibility(
    id: string,
    visible: boolean,
    actor: AuthenticatedRequestContext,
  ) {
    return this.dataSource.transaction(async (m) => {
      const before = await this.getProductWith(m, id);
      await this.setVisibilityUpdateProducto(m, {
        id,
        visible,
      });
      const after = await this.getProductWith(m, id);
      await this.auditRecords.appendChange(
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

  private async getCategoryWith(
    m: import('typeorm').EntityManager,
    id: string,
  ) {
    const r = await this.getCategoryWithFindCategoria(m, {
      id,
    });
    if (!r[0]) throw new NotFoundException('Categoría no encontrada.');
    return r[0];
  }

  private async getProductWith(m: import('typeorm').EntityManager, id: string) {
    const r = await this.getProductFindProducto(m, { id });
    if (!r[0]) throw new NotFoundException('Producto no encontrado.');
    return r[0];
  }

  private getCategoryFindCategoria(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetCategoryFindCategoriaRow[]> {
    return manager
      .getRepository(Category)
      .createQueryBuilder('categoria')
      .select(
        'id_categoria id, nombre name, activa active, orden "sortOrder", nombre_normalizado "normalizedName"',
      )
      .where('id_categoria=:id')
      .setParameters({ id: input.id })
      .getRawMany<GetCategoryFindCategoriaRow>();
  }

  private createCategoryInsertCategoria(
    manager: EntityManager,
    input: {
      normalized: string;
      name: string;
      active: boolean;
      sortOrder: number;
    },
  ): Promise<CreateCategoryInsertCategoriaRow[]> {
    return manager
      .getRepository(Category)
      .createQueryBuilder()
      .insert()
      .values([
        {
          normalizedName: input.normalized,
          name: input.name,
          active: input.active,
          sortOrder: input.sortOrder,
        },
      ])
      .returning('id_categoria')
      .execute()
      .then((result) => result.raw);
  }

  private async updateCategoryUpdateCategoria(
    manager: EntityManager,
    input: {
      id: string;
      name: string;
      normalized: string;
      active: boolean;
      sortOrder: number;
    },
  ): Promise<void> {
    await manager
      .getRepository(Category)
      .createQueryBuilder()
      .update(Category)
      .set({
        name: input.name,
        normalizedName: input.normalized,
        active: input.active,
        sortOrder: input.sortOrder,
      })
      .where('id_categoria=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private getProductFindProducto(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetProductFindProductoRow[]> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select(
        'p.id_producto id, p.sku, p.nombre name, p.descripcion description, p.precio_ctvs "priceCents", p.imagen_url "imageUrl", p.activo active, p.visible_menu "visibleInMenu", p.controla_inventario "tracksInventory", p.orden "sortOrder", c.id_categoria "categoryId", c.nombre "categoryName"',
      )
      .innerJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where('p.id_producto=:id')
      .setParameters({ id: input.id })
      .getRawMany<GetProductFindProductoRow>();
  }

  private createProductFindCategoria(
    manager: EntityManager,
    input: { categoryId: string },
  ): Promise<CreateProductFindCategoriaRow[]> {
    return manager
      .getRepository(Category)
      .createQueryBuilder('categoria')
      .select('id_categoria AS "id_categoria"')
      .where('id_categoria=:categoryId')
      .setParameters({ categoryId: input.categoryId })
      .getRawMany<CreateProductFindCategoriaRow>();
  }

  private createProductInsertProducto(
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
    return manager
      .getRepository(Product)
      .createQueryBuilder()
      .insert()
      .values([
        {
          category: { id: input.categoryId },
          sku: input.sku,
          name: input.name,
          description: input.description,
          priceCents: input.priceCents,
          imageUrl: input.imageUrl,
          active: input.active,
          visibleInMenu: input.visibleInMenu,
          tracksInventory: input.tracksInventory,
          sortOrder: input.sortOrder,
        },
      ])
      .returning('id_producto')
      .execute()
      .then((result) => result.raw);
  }

  private async updateProductUpdateProducto(
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
    await manager
      .getRepository(Product)
      .createQueryBuilder()
      .update(Product)
      .set({
        category: { id: input.categoryId },
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        imageUrl: input.imageUrl,
        active: input.active,
        visibleInMenu: input.visibleInMenu,
        tracksInventory: input.tracksInventory,
        sortOrder: input.sortOrder,
      })
      .where('id_producto=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private async setVisibilityUpdateProducto(
    manager: EntityManager,
    input: { id: string; visible: boolean },
  ): Promise<void> {
    await manager
      .getRepository(Product)
      .createQueryBuilder()
      .update(Product)
      .set({ visibleInMenu: input.visible })
      .where('id_producto=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  private getCategoryWithFindCategoria(
    manager: EntityManager,
    input: { id: string },
  ): Promise<GetCategoryWithFindCategoriaRow[]> {
    return manager
      .getRepository(Category)
      .createQueryBuilder('categoria')
      .select(
        'id_categoria id, nombre name, activa active, orden "sortOrder", nombre_normalizado "normalizedName"',
      )
      .where('id_categoria=:id')
      .setParameters({ id: input.id })
      .getRawMany<GetCategoryWithFindCategoriaRow>();
  }

  private async queryListCategories(
    manager: EntityManager,
    query: ListAdminQueryDto,
  ) {
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
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const count = await manager
      .getRepository(Category)
      .createQueryBuilder('c')
      .select('count(*)::int total')
      .where(
        (
          '' +
          String(String(clause).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .setParameters(queryParameters1)
      .getRawMany();
    args.push((page - 1) * limit, limit);
    const p = args.length - 1,
      l = args.length;
    const queryValues2: unknown[] = args;
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(Category)
      .createQueryBuilder('c')
      .select(
        'c.id_categoria id, c.nombre name, c.activa active, c.orden "sortOrder", c.nombre_normalizado "normalizedName"',
      )
      .where(
        (
          '' +
          String(String(clause).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .addOrderBy('c.orden', 'ASC')
      .addOrderBy('c.nombre', 'ASC')
      .addOrderBy('c.id_categoria', 'ASC')
      .limit(Number(queryValues2[Number(String(l).replace('$', '')) - 1]))
      .offset(Number(queryValues2[Number(String(p).replace('$', '')) - 1]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total: count[0].total, page, limit };
  }

  private async queryListProducts(
    manager: EntityManager,
    query: ListAdminQueryDto,
  ) {
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
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const count = await manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select('count(*)::int total')
      .innerJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where(
        (
          '' +
          String(String(clause).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const off = add((page - 1) * limit),
      lim = add(limit);
    const queryValues2: unknown[] = args;
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .select(
        'p.id_producto id, p.sku, p.nombre name, p.descripcion description, p.precio_ctvs "priceCents", p.imagen_url "imageUrl", p.activo active, p.visible_menu "visibleInMenu", p.controla_inventario "tracksInventory", p.orden "sortOrder", c.id_categoria "categoryId", c.nombre "categoryName"',
      )
      .innerJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where(
        (
          '' +
          String(String(clause).replace(/^WHERE\s+/i, '') || 'TRUE') +
          ''
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .addOrderBy('p.orden', 'ASC')
      .addOrderBy('p.nombre', 'ASC')
      .addOrderBy('p.id_producto', 'ASC')
      .limit(Number(queryValues2[Number(String(lim).replace('$', '')) - 1]))
      .offset(Number(queryValues2[Number(String(off).replace('$', '')) - 1]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total: count[0].total, page, limit };
  }
}
