import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { hashPassword, normalizeEmail, normalizePhone } from '../auth/password.util.js';
import { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ListAdminQueryDto } from './dto/list-admin-query.dto.js';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/user.dto.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';
import { CreateAdminProductDto, UpdateAdminProductDto } from './dto/product.dto.js';

type Actor = AuthenticatedRequestContext | null;
const pageArgs = (query: ListAdminQueryDto) => ({ page: query.page ?? 1, limit: query.limit ?? 20 });
const cleanName = (value: string) => {
  const name = value.trim().normalize('NFC').replace(/\s+/g, ' ');
  if (!name) throw new BadRequestException('El nombre no puede estar vacío.');
  return name;
};
const normalizeCategory = (value: string) => cleanName(value).toLowerCase();
const normalizeSku = (value: string) => value.trim().normalize('NFC').toLowerCase();

@Injectable()
export class AdminService {
  constructor(private readonly dataSource: DataSource) {}

  async listRoles() {
    return this.dataSource.query(`SELECT r.id_rol AS id, r.codigo AS code, r.nombre AS name,
      COALESCE(array_agg(p.codigo ORDER BY p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permissions
      FROM rol r LEFT JOIN rol_permiso rp ON rp.id_rol=r.id_rol LEFT JOIN permiso p ON p.id_permiso=rp.id_permiso
      GROUP BY r.id_rol ORDER BY r.codigo`);
  }

  async listUsers(query: ListAdminQueryDto) {
    const { page, limit } = pageArgs(query);
    const params: unknown[] = [];
    const filters: string[] = [];
    const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
    if (query.search?.trim()) { const p = bind(`%${query.search.trim()}%`); filters.push(`(u.correo_normalizado ILIKE ${p} OR (pr.nombres || ' ' || COALESCE(pr.apellidos,'')) ILIKE ${p})`); }
    if (query.roleCode) filters.push(`r.codigo=${bind(query.roleCode)}`);
    if (query.active !== undefined) filters.push(`u.activo=${bind(query.active)}`);
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const count = await this.dataSource.query(`SELECT count(*)::int AS total FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN perfil pr ON pr.id_usuario=u.id_usuario ${where}`, params);
    const offset = bind((page - 1) * limit); const take = bind(limit);
    const items = await this.dataSource.query(`SELECT u.id_usuario AS id, u.correo_normalizado AS email, u.activo AS active,
      r.codigo AS "roleCode", r.nombre AS "roleName", pr.nombres AS name, pr.apellidos AS "lastName", pr.telefono AS phone,
      c.id_cliente AS "clientId", u.creado_en AS "createdAt"
      FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN perfil pr ON pr.id_usuario=u.id_usuario
      LEFT JOIN cliente c ON c.id_usuario=u.id_usuario ${where}
      ORDER BY pr.nombres, u.correo_normalizado, u.id_usuario OFFSET ${offset} LIMIT ${take}`, params);
    return { items, total: count[0].total, page, limit };
  }

  async getUser(id: string) {
    const result = await this.dataSource.query(`SELECT u.id_usuario AS id, u.correo_normalizado AS email, u.activo AS active,
      r.codigo AS "roleCode", r.nombre AS "roleName", pr.nombres AS name, pr.apellidos AS "lastName", pr.telefono AS phone,
      c.id_cliente AS "clientId", u.creado_en AS "createdAt" FROM usuario u JOIN rol r ON r.id_rol=u.id_rol
      JOIN perfil pr ON pr.id_usuario=u.id_usuario LEFT JOIN cliente c ON c.id_usuario=u.id_usuario WHERE u.id_usuario=$1`, [id]);
    if (!result[0]) throw new NotFoundException('Usuario no encontrado.');
    return result[0];
  }

  async createUser(dto: CreateAdminUserDto, actor: Actor) {
    const email = normalizeEmail(dto.email); const passwordHash = await hashPassword(dto.initialPassword);
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    try {
      return await this.dataSource.transaction(async (manager) => {
        if (dto.roleCode === 'admin') await this.lockAdminMembership(manager);
        const rows = await manager.query('SELECT id_rol FROM rol WHERE codigo=$1', [dto.roleCode]);
        if (!rows[0]) throw new BadRequestException('El rol solicitado no existe.');
        const inserted = await manager.query(`INSERT INTO usuario(id_rol, correo_normalizado, password_hash, activo)
          VALUES($1,$2,$3,true) RETURNING id_usuario`, [rows[0].id_rol, email, passwordHash]);
        const id = inserted[0].id_usuario;
        await manager.query('INSERT INTO perfil(id_usuario,nombres,apellidos,telefono) VALUES($1,$2,NULL,$3)', [id, cleanName(dto.name), phone]);
        if (dto.roleCode === 'client') await manager.query('INSERT INTO cliente(id_usuario,nombre_contacto,telefono) VALUES($1,$2,$3)', [id, cleanName(dto.name), phone]);
        const response = await this.getUserWith(manager, id);
        await this.audit(manager, actor, 'usuario', id, 'users.created', {}, this.safeUserSnapshot(response));
        return response;
      });
    } catch (error) { this.handleUnique(error, 'Ya existe una cuenta con ese correo.'); throw error; }
  }

  async updateUser(id: string, dto: UpdateAdminUserDto, actor: AuthenticatedRequestContext) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Take the shared lock before the user row so simultaneous admin changes cannot deadlock.
        await this.lockAdminMembership(manager);
        const current = await this.getUserWith(manager, id, true);
        const nextRole = dto.roleCode ?? current.roleCode;
        const nextActive = dto.active ?? current.active;
        if (actor.userId === id && (dto.roleCode !== undefined && dto.roleCode !== current.roleCode || dto.active === false)) {
          throw new ConflictException('No puedes cambiar tu propio rol ni suspender tu cuenta.');
        }
        if (current.roleCode === 'admin' && current.active && (!nextActive || nextRole !== 'admin')) {
          const count = await manager.query(`SELECT count(*)::int AS total FROM usuario u JOIN rol r ON r.id_rol=u.id_rol WHERE u.activo=true AND r.codigo='admin'`);
          if (count[0].total <= 1) throw new ConflictException('No se puede modificar al último administrador activo.');
        }
        const role = await manager.query('SELECT id_rol FROM rol WHERE codigo=$1', [nextRole]);
        if (!role[0]) throw new BadRequestException('El rol solicitado no existe.');
        const email = dto.email === undefined ? current.email : normalizeEmail(dto.email);
        const phone = dto.phone === undefined ? current.phone : dto.phone === null ? null : normalizePhone(dto.phone);
        const name = dto.name === undefined ? current.name : cleanName(dto.name);
        const sensitive = email !== current.email || nextRole !== current.roleCode || nextActive !== current.active;
        await manager.query(`UPDATE usuario SET correo_normalizado=$2,id_rol=$3,activo=$4,version_acceso=version_acceso+$5 WHERE id_usuario=$1`,
          [id, email, role[0].id_rol, nextActive, sensitive ? 1 : 0]);
        await manager.query('UPDATE perfil SET nombres=$2,telefono=$3 WHERE id_usuario=$1', [id, name, phone]);
        const client = await manager.query('SELECT id_cliente FROM cliente WHERE id_usuario=$1', [id]);
        if (nextRole === 'client' && !client[0]) await manager.query('INSERT INTO cliente(id_usuario,nombre_contacto,telefono) VALUES($1,$2,$3)', [id, name, phone]);
        else if (client[0]) await manager.query('UPDATE cliente SET nombre_contacto=$2,telefono=$3 WHERE id_usuario=$1', [id, name, phone]);
        if (sensitive) await manager.query('UPDATE sesion_usuario SET revocada_en=now() WHERE id_usuario=$1 AND revocada_en IS NULL', [id]);
        const updated = await this.getUserWith(manager, id);
        await this.audit(manager, actor, 'usuario', id, 'users.updated', this.safeUserSnapshot(current), this.safeUserSnapshot(updated));
        return updated;
      });
    } catch (error) { this.handleUnique(error, 'Ya existe una cuenta con ese correo.'); throw error; }
  }

  async listCategories(query: ListAdminQueryDto) {
    const { page, limit } = pageArgs(query); const args: unknown[]=[]; const where: string[]=[];
    if (query.search?.trim()) { args.push(`%${query.search.trim()}%`); where.push(`c.nombre ILIKE $${args.length}`); }
    if (query.active !== undefined) { args.push(query.active); where.push(`c.activa=$${args.length}`); }
    const clause=where.length?`WHERE ${where.join(' AND ')}`:'';
    const count=await this.dataSource.query(`SELECT count(*)::int total FROM categoria c ${clause}`,args);
    args.push((page-1)*limit,limit); const p=args.length-1,l=args.length;
    const items=await this.dataSource.query(`SELECT c.id_categoria id,c.nombre name,c.activa active,c.orden "sortOrder",c.nombre_normalizado "normalizedName" FROM categoria c ${clause} ORDER BY c.orden,c.nombre,c.id_categoria OFFSET $${p} LIMIT $${l}`,args);
    return {items,total:count[0].total,page,limit};
  }
  async getCategory(id:string){const r=await this.dataSource.query(`SELECT id_categoria id,nombre name,activa active,orden "sortOrder",nombre_normalizado "normalizedName" FROM categoria WHERE id_categoria=$1`,[id]);if(!r[0])throw new NotFoundException('Categoría no encontrada.');return r[0];}
  async createCategory(dto:CreateCategoryDto,actor:AuthenticatedRequestContext){const name=cleanName(dto.name), normalized=normalizeCategory(dto.name);if(!name||normalized==='todos')throw new BadRequestException('El nombre está vacío o reservado.');try{return await this.dataSource.transaction(async m=>{const r=await m.query(`INSERT INTO categoria(nombre_normalizado,nombre,activa,orden) VALUES($1,$2,$3,$4) RETURNING id_categoria`,[normalized,name,dto.active??true,dto.sortOrder??0]);const id=r[0].id_categoria;const item=await this.getCategoryWith(m,id);await this.audit(m,actor,'categoria',id,'catalog.category_created',{},item);return item;});}catch(e){this.handleUnique(e,'Ya existe una categoría con ese nombre.');throw e;}}
  async updateCategory(id:string,dto:UpdateCategoryDto,actor:AuthenticatedRequestContext){try{return await this.dataSource.transaction(async m=>{const before=await this.getCategoryWith(m,id);const name=dto.name===undefined?before.name:cleanName(dto.name);const normalized=dto.name===undefined?before.normalizedName:normalizeCategory(dto.name);if(!name||normalized==='todos')throw new BadRequestException('El nombre está vacío o reservado.');await m.query('UPDATE categoria SET nombre=$2,nombre_normalizado=$3,activa=$4,orden=$5 WHERE id_categoria=$1',[id,name,normalized,dto.active??before.active,dto.sortOrder??before.sortOrder]);const after=await this.getCategoryWith(m,id);await this.audit(m,actor,'categoria',id,'catalog.category_updated',before,after);return after;});}catch(e){this.handleUnique(e,'Ya existe una categoría con ese nombre.');throw e;}}

  async listProducts(query:ListAdminQueryDto){const {page,limit}=pageArgs(query);const args:unknown[]=[];const f:string[]=[];const add=(v:unknown)=>{args.push(v);return `$${args.length}`;};if(query.search?.trim()){const p=add(`%${query.search.trim()}%`);f.push(`(p.nombre ILIKE ${p} OR p.descripcion ILIKE ${p} OR p.sku ILIKE ${p})`);}if(query.categoryId)f.push(`p.id_categoria=${add(query.categoryId)}`);if(query.active!==undefined)f.push(`p.activo=${add(query.active)}`);if(query.visibleInMenu!==undefined)f.push(`p.visible_menu=${add(query.visibleInMenu)}`);const clause=f.length?`WHERE ${f.join(' AND ')}`:'';const count=await this.dataSource.query(`SELECT count(*)::int total FROM producto p LEFT JOIN categoria c ON c.id_categoria=p.id_categoria ${clause}`,args);const off=add((page-1)*limit),lim=add(limit);const items=await this.dataSource.query(`SELECT p.id_producto id,p.sku,p.nombre name,p.descripcion description,p.precio_ctvs "priceCents",p.imagen_url "imageUrl",p.activo active,p.visible_menu "visibleInMenu",p.controla_inventario "tracksInventory",p.orden "sortOrder",c.id_categoria "categoryId",c.nombre "categoryName" FROM producto p LEFT JOIN categoria c ON c.id_categoria=p.id_categoria ${clause} ORDER BY p.orden,p.nombre,p.id_producto OFFSET ${off} LIMIT ${lim}`,args);return {items,total:count[0].total,page,limit};}
  async getProduct(id:string){const r=await this.dataSource.query(`SELECT p.id_producto id,p.sku,p.nombre name,p.descripcion description,p.precio_ctvs "priceCents",p.imagen_url "imageUrl",p.activo active,p.visible_menu "visibleInMenu",p.controla_inventario "tracksInventory",p.orden "sortOrder",c.id_categoria "categoryId",c.nombre "categoryName" FROM producto p JOIN categoria c ON c.id_categoria=p.id_categoria WHERE p.id_producto=$1`,[id]);if(!r[0])throw new NotFoundException('Producto no encontrado.');return r[0];}
  async createProduct(dto:CreateAdminProductDto,actor:Actor){const sku=normalizeSku(dto.sku);if(!sku)throw new BadRequestException('El SKU no puede estar vacío.');try{return await this.dataSource.transaction(async m=>{if(dto.categoryId){const cat=await m.query('SELECT id_categoria FROM categoria WHERE id_categoria=$1',[dto.categoryId]);if(!cat[0])throw new BadRequestException('La categoría no existe.');}const r=await m.query(`INSERT INTO producto(id_categoria,sku,nombre,descripcion,precio_ctvs,imagen_url,activo,visible_menu,controla_inventario,orden) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_producto`,[dto.categoryId??null,sku,cleanName(dto.name),dto.description??null,dto.priceCents,dto.imageUrl??null,dto.active??true,dto.visibleInMenu??true,dto.tracksInventory??true,dto.sortOrder??0]);const id=r[0].id_producto;const after=await this.getProductWith(m,id);await this.audit(m,actor,'producto',id,'catalog.product_created',{},after);return after;});}catch(e){this.handleUnique(e,'Ya existe un producto con ese SKU.');throw e;}}
  async updateProduct(id:string,dto:UpdateAdminProductDto,actor:AuthenticatedRequestContext){try{return await this.dataSource.transaction(async m=>{const before=await this.getProductWith(m,id);if(dto.categoryId){const c=await m.query('SELECT id_categoria FROM categoria WHERE id_categoria=$1',[dto.categoryId]);if(!c[0])throw new BadRequestException('La categoría no existe.');}await m.query(`UPDATE producto SET id_categoria=$2,nombre=$3,descripcion=$4,precio_ctvs=$5,imagen_url=$6,activo=$7,visible_menu=$8,controla_inventario=$9,orden=$10 WHERE id_producto=$1`,[id,dto.categoryId??before.categoryId,dto.name===undefined?before.name:cleanName(dto.name),dto.description===undefined?before.description:dto.description,dto.priceCents??before.priceCents,dto.imageUrl===undefined?before.imageUrl:dto.imageUrl,dto.active??before.active,dto.visibleInMenu??before.visibleInMenu,dto.tracksInventory??before.tracksInventory,dto.sortOrder??before.sortOrder]);const after=await this.getProductWith(m,id);await this.audit(m,actor,'producto',id,'catalog.product_updated',before,after);return after;});}catch(e){this.handleUnique(e,'Conflicto al guardar el producto.');throw e;}}
  async setVisibility(id:string,visible:boolean,actor:AuthenticatedRequestContext){return this.dataSource.transaction(async m=>{const before=await this.getProductWith(m,id);await m.query('UPDATE producto SET visible_menu=$2 WHERE id_producto=$1',[id,visible]);const after=await this.getProductWith(m,id);await this.audit(m,actor,'producto',id,'catalog.product_visibility_changed',before,after);return after;});}

  private async lockAdminMembership(manager: import('typeorm').EntityManager){await manager.query('SELECT pg_advisory_xact_lock(71920403)');}
  private async getUserWith(manager:import('typeorm').EntityManager,id:string,lock=false){const rows=await manager.query(`SELECT u.id_usuario id,u.correo_normalizado email,u.activo active,r.codigo "roleCode",r.nombre "roleName",pr.nombres name,pr.apellidos "lastName",pr.telefono phone,c.id_cliente "clientId",u.creado_en "createdAt" FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN perfil pr ON pr.id_usuario=u.id_usuario LEFT JOIN cliente c ON c.id_usuario=u.id_usuario WHERE u.id_usuario=$1${lock?' FOR UPDATE OF u':''}`,[id]);if(!rows[0])throw new NotFoundException('Usuario no encontrado.');return rows[0];}
  private async getCategoryWith(m:import('typeorm').EntityManager,id:string){const r=await m.query('SELECT id_categoria id,nombre name,activa active,orden "sortOrder",nombre_normalizado "normalizedName" FROM categoria WHERE id_categoria=$1',[id]);if(!r[0])throw new NotFoundException('Categoría no encontrada.');return r[0];}
  private async getProductWith(m:import('typeorm').EntityManager,id:string){const r=await m.query(`SELECT p.id_producto id,p.sku,p.nombre name,p.descripcion description,p.precio_ctvs "priceCents",p.imagen_url "imageUrl",p.activo active,p.visible_menu "visibleInMenu",p.controla_inventario "tracksInventory",p.orden "sortOrder",c.id_categoria "categoryId",c.nombre "categoryName" FROM producto p LEFT JOIN categoria c ON c.id_categoria=p.id_categoria WHERE p.id_producto=$1`,[id]);if(!r[0])throw new NotFoundException('Producto no encontrado.');return r[0];}
  private safeUserSnapshot(u:any){return {id:u.id,email:u.email,active:u.active,roleCode:u.roleCode,name:u.name,lastName:u.lastName,phone:u.phone,clientId:u.clientId};}
  private async audit(m:import('typeorm').EntityManager,actor:Actor,type:string,id:string,event:string,before:unknown,after:unknown){await m.query(`INSERT INTO auditoria(actor_usuario_id,actor_tipo,recurso_tipo,recurso_id,evento,detalle) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[actor?.userId??null,actor?'usuario':'sistema',type,id,event,JSON.stringify({before,after})]);}
  private handleUnique(error:unknown,message:string){if(error instanceof QueryFailedError&&(error as QueryFailedError&{driverError?:{code?:string}}).driverError?.code==='23505')throw new ConflictException(message);}
}
