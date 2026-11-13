import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { Category } from '../catalog/entities/category.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { type RewardCreateDto } from './dto/reward-create.dto.js';
import { type RewardListDto } from './dto/reward-list.dto.js';
import { type RewardUpdateDto } from './dto/reward-update.dto.js';
import { Reward } from './entities/reward.entity.js';
import {
  CreateRewardFindProductoRow,
  CreateRewardInsertRecompensaRow,
  rewardFields,
  RewardFindRecompensaRow,
  StaffFindRolPermisoRow,
  UpdateRewardFindRecompensaRow,
  UpdateRewardUpdateRecompensaRow,
} from './types/rewards.types.js';

type Actor = { userId?: string; guestSessionId?: string; sessionId?: string };

@Injectable()
export class RewardsService {
  constructor(
    @InjectRepository(Reward) private readonly records: Repository<Reward>,
    private readonly idem: ParticipationIdempotencyService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
  ) {}

  async staff(
    m: EntityManager,
    actor: AuthenticatedRequestContext,
    permission: string,
  ) {
    const [s] = await this.staffFindRolPermiso(m, {
      userId: actor.userId,
      sessionId: actor.sessionId,
      permission,
    });
    if (!s || !s.activo || s.revocada_en || !s.valid)
      throw new UnauthorizedException('Sesión inválida.');
    if (!s.allowed) throw new ForbiddenException('Permiso insuficiente.');
    return s.role as string;
  }

  private user(actor: Actor) {
    if (!actor.userId)
      throw new UnauthorizedException('Se requiere sesión de personal.');
    return { userId: actor.userId };
  }

  async createReward(
    dto: RewardCreateDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    return this.idem.run(
      this.user(actor),
      'admin/rewards',
      key,
      dto,
      201,
      'recompensa',
      {
        authorize: (m) =>
          this.staff(m, actor, 'rewards.manage').then(() => undefined),
        action: async (m) => {
          await this.operationalContext.lockTableOperations(m);
          const [product] = await this.createRewardFindProducto(m, {
            productId: dto.productId,
          });
          if (!product) throw new NotFoundException('Producto no encontrado.');
          const [row] = await this.createRewardInsertRecompensa(m, {
            name: dto.name,
            description: dto.description ?? null,
            productId: dto.productId,
            pointsCost: dto.pointsCost,
            active: dto.active,
            sortOrder: dto.sortOrder,
          });
          await this.auditLog.append(
            m,
            this.user(actor),
            'recompensa',
            row.id,
            'reward.created',
            {
              name: dto.name,
              productId: dto.productId,
              pointsCost: dto.pointsCost,
              active: dto.active,
              sortOrder: dto.sortOrder,
            },
          );
          return {
            resourceId: row.id,
            response: await this.reward(row.id, true, m),
          };
        },
      },
    );
  }

  async updateReward(
    id: string,
    dto: RewardUpdateDto,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    const changes = Object.fromEntries(
      Object.entries(dto).filter(
        ([k, v]) => k !== 'expectedVersion' && v !== undefined,
      ),
    );
    if (!Object.keys(changes).length)
      throw new BadRequestException('Envía al menos un campo modificable.');
    return this.idem.run(
      this.user(actor),
      `admin/rewards/${id.toLowerCase()}`,
      key,
      dto,
      200,
      'recompensa',
      {
        authorize: (m) =>
          this.staff(m, actor, 'rewards.manage').then(() => undefined),
        action: async (m) => {
          await this.operationalContext.lockTableOperations(m);
          const [old] = await this.updateRewardFindRecompensa(m, {
            id,
          });
          if (!old) throw new NotFoundException('Recompensa no encontrada.');
          if (old.version !== dto.expectedVersion)
            throw new ConflictException('La versión de la recompensa cambió.');
          const updatedRows = await this.updateRewardUpdateRecompensa(m, {
            id,
            name: dto.name,
            description: dto.description !== undefined,
            description4: dto.description ?? null,
            pointsCost: dto.pointsCost,
            active: dto.active,
            sortOrder: dto.sortOrder,
          });
          await this.auditLog.append(
            m,
            this.user(actor),
            'recompensa',
            id,
            'reward.updated',
            {
              before: {
                name: old.nombre,
                description: old.descripcion,
                pointsCost: Number(old.costo_puntos),
                active: old.activa,
                sortOrder: old.orden,
                version: old.version,
              },
              after: changes,
            },
          );
          return {
            resourceId: updatedRows[0].id,
            response: await this.reward(id, true, m),
          };
        },
      },
    );
  }

  private async reward(
    id: string,
    admin: boolean,
    m: EntityManager = this.records.manager,
  ) {
    const [r] = await this.rewardFindRecompensa(m, { id });
    if (
      !r ||
      (!admin &&
        (!r.active ||
          !r.product_active ||
          !r.product_visible ||
          !r.category_active))
    )
      throw new NotFoundException('Recompensa no encontrada.');
    delete r.product_active;
    delete r.product_visible;
    delete r.category_active;
    return r;
  }

  async listRewards(q: RewardListDto, admin = false) {
    return this.queryListRewards(this.records.manager, q, admin);
  }

  publicReward(id: string) {
    return this.reward(id, false);
  }

  adminReward(id: string) {
    return this.reward(id, true);
  }

  private async staffFindRolPermiso(
    manager: EntityManager,
    input: { userId: string; sessionId: string; permission: string },
  ): Promise<StaffFindRolPermisoRow[]> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
      input.permission,
    );
    return row ? [row] : [];
  }

  private createRewardFindProducto(
    manager: EntityManager,
    input: { productId: string },
  ): Promise<CreateRewardFindProductoRow[]> {
    return manager
      .getRepository(Product)
      .createQueryBuilder('producto')
      .select('id_producto AS "id_producto"')
      .where('id_producto=:productId')
      .setLock('pessimistic_read', undefined, undefined)
      .setParameters({ productId: input.productId })
      .getRawMany<CreateRewardFindProductoRow>();
  }

  private createRewardInsertRecompensa(
    manager: EntityManager,
    input: {
      name: string;
      description: string | null;
      productId: string;
      pointsCost: number;
      active: boolean;
      sortOrder: number;
    },
  ): Promise<CreateRewardInsertRecompensaRow[]> {
    return manager
      .getRepository(Reward)
      .createQueryBuilder()
      .insert()
      .values([
        {
          nombre: input.name,
          descripcion: input.description,
          id_producto: input.productId,
          costo_puntos: String(input.pointsCost),
          activa: input.active,
          orden: input.sortOrder,
        },
      ])
      .returning('id_recompensa id')
      .execute()
      .then((result) => result.raw);
  }

  private updateRewardFindRecompensa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UpdateRewardFindRecompensaRow[]> {
    return manager
      .getRepository(Reward)
      .createQueryBuilder('recompensa')
      .select([
        '"recompensa"."id_recompensa" AS "id_recompensa"',
        '"recompensa"."id_producto" AS "id_producto"',
        '"recompensa"."orden" AS "orden"',
        '"recompensa"."creada_en" AS "creada_en"',
        '"recompensa"."descripcion" AS "descripcion"',
        '"recompensa"."version" AS "version"',
        '"recompensa"."activa" AS "activa"',
        '"recompensa"."costo_puntos" AS "costo_puntos"',
        '"recompensa"."nombre" AS "nombre"',
        '"recompensa"."actualizada_en" AS "actualizada_en"',
      ])
      .where('id_recompensa=:id')
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<UpdateRewardFindRecompensaRow>();
  }

  private async updateRewardUpdateRecompensa(
    manager: EntityManager,
    input: {
      id: string;
      name: string | undefined;
      description: boolean;
      description4: string | null;
      pointsCost: number | undefined;
      active: boolean | undefined;
      sortOrder: number | undefined;
    },
  ): Promise<UpdateRewardUpdateRecompensaRow[]> {
    const rows = await manager
      .getRepository(Reward)
      .createQueryBuilder()
      .update(Reward)
      .set({
        nombre: () => 'COALESCE(:name,nombre)',
        descripcion: () =>
          'CASE WHEN :description THEN :description4 ELSE descripcion END',
        costo_puntos: () => 'COALESCE(:pointsCost,costo_puntos)',
        activa: () => 'COALESCE(:active,activa)',
        orden: () => 'COALESCE(:sortOrder,orden)',
        version: () => 'version+1',
        actualizada_en: () => 'clock_timestamp()',
      })
      .where('id_recompensa=:id')
      .returning('id_recompensa id')
      .setParameters({
        id: input.id,
        name: input.name,
        description: input.description,
        description4: input.description4,
        pointsCost: input.pointsCost,
        active: input.active,
        sortOrder: input.sortOrder,
      })
      .execute()
      .then((result) => result.raw);
    return rows;
  }

  private rewardFindRecompensa(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RewardFindRecompensaRow[]> {
    return manager
      .getRepository(Reward)
      .createQueryBuilder('r')
      .select(
        (
          '' +
          String(rewardFields) +
          ',p.activo product_active,p.visible_menu product_visible,c.activa category_active'
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .innerJoin(Product, 'p', 'p.id_producto=r.id_producto')
      .leftJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where('r.id_recompensa=:id')
      .setParameters({ id: input.id })
      .getRawMany<RewardFindRecompensaRow>();
  }

  private async queryListRewards(
    manager: EntityManager,
    q: RewardListDto,
    admin = false,
  ) {
    const args = [
      q.search ? `%${q.search}%` : null,
      q.active ?? null,
      q.productId ?? null,
      admin,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(Reward)
      .createQueryBuilder('r')
      .select('count(*)::int total')
      .innerJoin(Product, 'p', 'p.id_producto=r.id_producto')
      .leftJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where(
        '(:p4 OR (r.activa AND p.activo AND p.visible_menu AND c.activa)) AND (:p1::text IS NULL OR r.nombre ILIKE :p1 OR p.nombre ILIKE :p1) AND (:p2::boolean IS NULL OR r.activa=:p2) AND (:p3::uuid IS NULL OR r.id_producto=:p3)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [...args, q.limit, (q.page - 1) * q.limit];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(Reward)
      .createQueryBuilder('r')
      .select([
        'r.id_recompensa AS id',
        'r.nombre AS name',
        'r.descripcion AS description',
        'r.id_producto AS "productId"',
        'r.costo_puntos::float8 AS "pointsCost"',
        'r.activa AS active',
        'r.orden AS "sortOrder"',
        'r.version AS version',
        'r.creada_en AS "createdAt"',
        'r.actualizada_en AS "updatedAt"',
        'p.nombre AS "productName"',
        'p.precio_ctvs AS "productPriceCents"',
        'p.controla_inventario AS "tracksInventory"',
      ])
      .innerJoin(Product, 'p', 'p.id_producto=r.id_producto')
      .leftJoin(Category, 'c', 'c.id_categoria=p.id_categoria')
      .where(
        '(:p4 OR (r.activa AND p.activo AND p.visible_menu AND c.activa)) AND (:p1::text IS NULL OR r.nombre ILIKE :p1 OR p.nombre ILIKE :p1) AND (:p2::boolean IS NULL OR r.activa=:p2) AND (:p3::uuid IS NULL OR r.id_producto=:p3)',
      )
      .addOrderBy('r.orden', 'ASC')
      .addOrderBy('r.nombre', 'ASC')
      .addOrderBy('r.id_recompensa', 'ASC')
      .limit(Number(queryValues2[4]))
      .offset(Number(queryValues2[5]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total, page: q.page, limit: q.limit };
  }
}
