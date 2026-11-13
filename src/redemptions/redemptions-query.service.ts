import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Product } from '../catalog/entities/product.entity.js';
import { Reward } from '../rewards/entities/reward.entity.js';
import {
  redemptionFields,
  RedemptionFindHistorialCanjeRow,
  RedemptionFindSolicitudCanjeRow,
} from '../rewards/types/rewards.types.js';
import { type AdminRedemptionListDto } from './dto/admin-redemption-list.dto.js';
import { type RedemptionListDto } from './dto/redemption-list.dto.js';
import { RedemptionHistory } from './entities/redemption-history.entity.js';
import { RedemptionRequest } from './entities/redemption-request.entity.js';

@Injectable()
export class RedemptionsQueryService {
  constructor(
    @InjectRepository(RedemptionRequest)
    private readonly records: Repository<RedemptionRequest>,
  ) {}

  async redemption(
    id: string,
    clientId?: string,
    m: EntityManager = this.records.manager,
    includeHistory = false,
  ) {
    const [r] = await this.redemptionFindSolicitudCanje(m, {
      id,
      clientId: clientId ?? null,
    });
    if (!r) throw new NotFoundException('Canje no encontrado.');
    if (includeHistory)
      r.history = await this.redemptionFindHistorialCanje(m, {
        id,
      });
    return r;
  }

  async listRedemptions(
    q: RedemptionListDto | AdminRedemptionListDto,
    clientId?: string,
  ) {
    const { rows, total } = await this.listRedemptionIds(
      this.records.manager,
      q,
      clientId,
    );
    const items = await Promise.all(
      rows.map((x: { id: string }) => this.redemption(x.id, clientId)),
    );
    return { items, total, page: q.page, limit: q.limit };
  }

  private redemptionFindSolicitudCanje(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<RedemptionFindSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('s')
      .select(
        (
          '' +
          String(redemptionFields) +
          ',r.nombre "rewardName",p.nombre "productName"'
        ).replace(/\$(\d+)/g, ':p$1'),
      )
      .innerJoin(Reward, 'r', 'r.id_recompensa=s.id_recompensa')
      .innerJoin(Product, 'p', 'p.id_producto=s.id_producto')
      .where(
        's.id_canje=:id AND (:clientId::uuid IS NULL OR s.id_cliente=:clientId)',
      )
      .setParameters({ id: input.id, clientId: input.clientId })
      .getRawMany<RedemptionFindSolicitudCanjeRow>();
  }

  private redemptionFindHistorialCanje(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RedemptionFindHistorialCanjeRow[]> {
    return manager
      .getRepository(RedemptionHistory)
      .createQueryBuilder('historial_canje')
      .select(
        'evento event, actor_usuario "actorUserId", detalle AS detail, ocurrido_en "occurredAt"',
      )
      .where('id_canje=:id')
      .addOrderBy('ocurrido_en', 'ASC')
      .addOrderBy('id_historial', 'ASC')
      .setParameters({ id: input.id })
      .getRawMany<RedemptionFindHistorialCanjeRow>();
  }

  private async listRedemptionIds(
    manager: EntityManager,
    q: RedemptionListDto | AdminRedemptionListDto,
    clientId?: string,
  ) {
    const a = q as AdminRedemptionListDto;
    const args = [
      clientId ?? null,
      q.status ?? null,
      q.visitId ?? null,
      a.clientId ?? null,
      a.operatingDayId ?? null,
    ];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('s')
      .select('count(*)::int total')
      .where(
        '(:p1::uuid IS NULL OR s.id_cliente=:p1) AND (:p2::text IS NULL OR s.estado=:p2) AND (:p3::uuid IS NULL OR s.id_visita=:p3) AND (:p4::uuid IS NULL OR s.id_cliente=:p4) AND (:p5::uuid IS NULL OR s.id_jornada=:p5)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [...args, q.limit, (q.page - 1) * q.limit];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const rows = await manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('s')
      .select('s.id_canje id')
      .where(
        '(:p1::uuid IS NULL OR s.id_cliente=:p1) AND (:p2::text IS NULL OR s.estado=:p2) AND (:p3::uuid IS NULL OR s.id_visita=:p3) AND (:p4::uuid IS NULL OR s.id_cliente=:p4) AND (:p5::uuid IS NULL OR s.id_jornada=:p5)',
      )
      .addOrderBy('s.creada_en', 'DESC')
      .addOrderBy('s.id_canje', 'DESC')
      .limit(Number(queryValues2[5]))
      .offset(Number(queryValues2[6]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { rows, total };
  }
}
