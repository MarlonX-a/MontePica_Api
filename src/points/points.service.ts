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
import { AuditService } from '../common/audit/audit.service.js';
import { ParticipationIdempotencyService } from '../common/idempotency/participation-idempotency.service.js';
import { AuthorizationService } from '../common/identity/authorization.service.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import { RedemptionRequest } from '../redemptions/entities/redemption-request.entity.js';
import { PointsAccrual } from './entities/points-accrual.entity.js';
import { PointsMovement } from './entities/points-movement.entity.js';
import { PointsSettings } from './entities/points-settings.entity.js';
import {
  BalanceFindMovimientoPuntosRow,
  ConfigureFindRolPermisoRow,
  ConfigureInsertConfiguracionPuntosRow,
  CurrentFindConfiguracionPuntosRow,
  RequireClientFindClienteRow,
} from './types/points.types.js';

@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(PointsMovement)
    private readonly records: Repository<PointsMovement>,
    private readonly idem: ParticipationIdempotencyService,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly authorization: AuthorizationService,
  ) {}

  async current(m: EntityManager = this.records.manager) {
    const [r] = await this.currentFindConfiguracionPuntos(m);
    return r;
  }

  async publicSettings() {
    const { configuredBy: _actor, ...settings } = await this.current();
    return settings;
  }

  async configure(
    enabled: boolean,
    rate: number,
    actor: AuthenticatedRequestContext,
    key?: string,
  ) {
    if (!Number.isSafeInteger(rate) || rate < 1 || rate > 1000)
      throw new BadRequestException('Tasa fuera del rango permitido.');
    return this.idem.run(
      { userId: actor.userId },
      'points/settings',
      key,
      { enabled, pointsPerDollar: rate },
      200,
      'configuracion_puntos',
      {
        authorize: async (m) => {
          const [s] = await this.configureFindRolPermiso(m, {
            userId: actor.userId,
            sessionId: actor.sessionId,
          });
          if (!s || !s.activo || s.revocada_en || !s.valid)
            throw new UnauthorizedException('Sesión inválida.');
          if (!s.allowed) throw new ForbiddenException('Permiso insuficiente.');
        },
        action: async (m) => {
          await this.operationalContext.lockTableOperations(m);
          const old = await this.current(m);
          const [row] = await this.configureInsertConfiguracionPuntos(m, {
            version: old.version + 1,
            enabled,
            rate,
            userId: actor.userId,
          });
          const result = await this.current(m);
          await this.auditLog.append(
            m,
            { userId: actor.userId },
            'configuracion_puntos',
            row.id,
            'points.settings_updated',
            { before: old, after: result },
          );
          return { resourceId: row.id, response: result };
        },
      },
    );
  }

  async balance(clientId: string, m: EntityManager = this.records.manager) {
    await this.requireClient(clientId, m);
    const [r] = await this.balanceFindMovimientoPuntos(m, {
      clientId,
    });
    if (
      ![r.balance, r.pending, r.reserved].every((v) =>
        Number.isSafeInteger(Number(v)),
      )
    )
      throw new ConflictException('Saldo fuera del rango seguro.');
    const balance = Number(r.balance),
      reservedPoints = Number(r.reserved);
    const available = BigInt(r.balance) - BigInt(r.reserved);
    return {
      balance,
      pendingPoints: Number(r.pending),
      reservedPoints,
      availablePoints: Number(available > 0n ? available : 0n),
    };
  }

  private async requireClient(
    id: string,
    m: EntityManager = this.records.manager,
  ) {
    const [c] = await this.requireClientFindCliente(m, { id });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
  }

  async movements(
    clientId: string,
    q: { page: number; limit: number; type?: string; paymentId?: string },
  ) {
    await this.requireClient(clientId);
    return this.queryMovements(this.records.manager, clientId, q);
  }

  private currentFindConfiguracionPuntos(
    manager: EntityManager,
  ): Promise<CurrentFindConfiguracionPuntosRow[]> {
    return manager
      .getRepository(PointsSettings)
      .createQueryBuilder('configuracion_puntos')
      .select(
        'version, habilitado AS enabled, tasa_por_dolar AS "pointsPerDollar", configurada_por AS "configuredBy", creada_en AS "createdAt"',
      )
      .addOrderBy('version', 'DESC')
      .limit(1)
      .getRawMany<CurrentFindConfiguracionPuntosRow>();
  }

  private async configureFindRolPermiso(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<ConfigureFindRolPermisoRow[]> {
    const row = await this.authorization.lockSession(
      manager,
      input.userId,
      input.sessionId,
      'points.configure',
    );
    return row ? [row] : [];
  }

  private configureInsertConfiguracionPuntos(
    manager: EntityManager,
    input: { version: number; enabled: boolean; rate: number; userId: string },
  ): Promise<ConfigureInsertConfiguracionPuntosRow[]> {
    return manager
      .getRepository(PointsSettings)
      .createQueryBuilder()
      .insert()
      .values([
        {
          version: input.version,
          habilitado: input.enabled,
          tasa_por_dolar: input.rate,
          configurada_por: input.userId,
        },
      ])
      .returning('id_configuracion id')
      .execute()
      .then((result) => result.raw);
  }

  private balanceFindMovimientoPuntos(
    manager: EntityManager,
    input: { clientId: string },
  ): Promise<BalanceFindMovimientoPuntosRow[]> {
    return manager
      .createQueryBuilder()
      .select(
        "COALESCE((SELECT sum(puntos) FROM movimiento_puntos WHERE id_cliente=:clientId),0)::text balance, COALESCE((SELECT sum(puntos) FROM acumulacion_puntos WHERE id_cliente=:clientId AND estado='pending'),0)::text pending, COALESCE((SELECT sum(puntos) FROM reserva_puntos_canje WHERE id_cliente=:clientId AND estado='active'),0)::text reserved",
      )
      .from('(SELECT 1)', '_singleton')
      .setParameters({ clientId: input.clientId })
      .getRawMany<BalanceFindMovimientoPuntosRow>();
  }

  private requireClientFindCliente(
    manager: EntityManager,
    input: { id: string },
  ): Promise<RequireClientFindClienteRow[]> {
    return manager
      .getRepository(Client)
      .createQueryBuilder('cliente')
      .select('1 AS "1"')
      .where('id_cliente=:id')
      .setParameters({ id: input.id })
      .getRawMany<RequireClientFindClienteRow>();
  }

  private async queryMovements(
    manager: EntityManager,
    clientId: string,
    q: { page: number; limit: number; type?: string; paymentId?: string },
  ) {
    const args = [clientId, q.type ?? null, q.paymentId ?? null];
    const queryValues1: unknown[] = args;
    const queryParameters1 = Object.fromEntries(
      queryValues1.map((value, index) => ['p' + (index + 1), value]),
    );
    const [{ total }] = await manager
      .getRepository(PointsMovement)
      .createQueryBuilder('m')
      .select('count(*)::int total')
      .leftJoin(PointsAccrual, 'a', 'a.id_acumulacion=m.id_acumulacion')
      .leftJoin(RedemptionRequest, 'sc', 'sc.id_canje=m.id_canje')
      .where(
        'm.id_cliente=:p1 AND (:p2::text IS NULL OR m.tipo=:p2) AND (:p3::uuid IS NULL OR a.id_pago=:p3)',
      )
      .setParameters(queryParameters1)
      .getRawMany();
    const queryValues2: unknown[] = [...args, q.limit, (q.page - 1) * q.limit];
    const queryParameters2 = Object.fromEntries(
      queryValues2.map((value, index) => ['p' + (index + 1), value]),
    );
    const items = await manager
      .getRepository(PointsMovement)
      .createQueryBuilder('m')
      .select(
        'm.id_movimiento id, m.tipo type, m.puntos::float8 points, COALESCE(sc.id_pedido,(SELECT o.id_pedido FROM pedido o JOIN liquidacion l ON l.id_cuenta=o.id_cuenta JOIN pago p ON p.id_liquidacion=l.id_liquidacion WHERE p.id_pago=a.id_pago AND o.modalidad=\'delivery\' LIMIT 1)) AS "orderId", a.id_pago "paymentId", m.id_canje "redemptionId", m.creado_en "createdAt"',
      )
      .leftJoin(PointsAccrual, 'a', 'a.id_acumulacion=m.id_acumulacion')
      .leftJoin(RedemptionRequest, 'sc', 'sc.id_canje=m.id_canje')
      .where(
        'm.id_cliente=:p1 AND (:p2::text IS NULL OR m.tipo=:p2) AND (:p3::uuid IS NULL OR a.id_pago=:p3)',
      )
      .addOrderBy('m.creado_en', 'DESC')
      .addOrderBy('m.id_movimiento', 'DESC')
      .limit(Number(queryValues2[3]))
      .offset(Number(queryValues2[4]))
      .setParameters(queryParameters2)
      .getRawMany();
    return { items, total, page: q.page, limit: q.limit };
  }
}
