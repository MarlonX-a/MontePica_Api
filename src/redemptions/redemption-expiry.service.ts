import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service.js';
import { OperationalContextService } from '../common/transactions/operational-context.service.js';
import {
  ExpirePendingFindSolicitudCanjeNextRow,
  ExpirePendingFindSolicitudCanjeRow,
} from '../rewards/types/rewards.types.js';
import { RedemptionRequest } from './entities/redemption-request.entity.js';
import { RedemptionReservationsService } from './redemption-reservations.service.js';

@Injectable()
export class RedemptionExpiryService {
  private readonly logger = new Logger(RedemptionExpiryService.name);
  private expiryTimer?: ReturnType<typeof setInterval>;
  private expiryRunning = false;
  constructor(
    @InjectRepository(RedemptionRequest)
    private readonly records: Repository<RedemptionRequest>,
    private readonly db: DataSource,
    private readonly auditLog: AuditService,
    private readonly operationalContext: OperationalContextService,
    private readonly reservations: RedemptionReservationsService,
  ) {}

  onModuleInit() {
    void this.expirePending().catch((error) =>
      this.logger.error(
        'No se pudieron procesar los vencimientos de canjes.',
        error instanceof Error ? error.stack : undefined,
      ),
    );
    this.expiryTimer = setInterval(
      () =>
        void this.expirePending().catch((error) =>
          this.logger.error(
            'Falló el ciclo de vencimientos de canjes.',
            error instanceof Error ? error.stack : undefined,
          ),
        ),
      60_000,
    );
    this.expiryTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  async expirePending() {
    if (this.expiryRunning || !this.db.isInitialized) return;
    this.expiryRunning = true;
    try {
      const attempted: string[] = [];
      while (true) {
        const ids: Array<{ id: string }> =
          await this.expirePendingFindSolicitudCanje(this.records.manager, {
            attempted,
          });
        if (!ids.length) break;
        for (const row of ids) {
          attempted.push(row.id);
          try {
            await this.db.transaction(async (m) => {
              await this.operationalContext.lockTableOperations(m);
              const [s] = await this.expirePendingFindSolicitudCanjeNext(m, {
                id: row.id,
              });
              if (!s) return;
              await this.reservations.release(m, row.id, 'expired');
              await this.reservations.history(
                m,
                row.id,
                undefined,
                'redemption.expired',
              );
              await this.auditLog.append(
                m,
                {},
                'solicitud_canje',
                row.id,
                'redemption.expired',
                {},
              );
            });
          } catch (error) {
            this.logger.error(
              `No se pudo vencer un canje pendiente.`,
              error instanceof Error ? error.stack : undefined,
            );
          }
        }
      }
    } finally {
      this.expiryRunning = false;
    }
  }

  private expirePendingFindSolicitudCanje(
    manager: EntityManager,
    input: { attempted: string[] },
  ): Promise<ExpirePendingFindSolicitudCanjeRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select('id_canje id')
      .where(
        "estado='pending' AND expira_en<=clock_timestamp() AND NOT(id_canje=ANY(:attempted::uuid[]))",
      )
      .addOrderBy('expira_en', 'ASC')
      .addOrderBy('id_canje', 'ASC')
      .limit(100)
      .setParameters({ attempted: input.attempted })
      .getRawMany<ExpirePendingFindSolicitudCanjeRow>();
  }

  private expirePendingFindSolicitudCanjeNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<ExpirePendingFindSolicitudCanjeNextRow[]> {
    return manager
      .getRepository(RedemptionRequest)
      .createQueryBuilder('solicitud_canje')
      .select('id_canje AS "id_canje"')
      .where(
        "id_canje=:id AND estado='pending' AND expira_en<=clock_timestamp()",
      )
      .setLock('pessimistic_write', undefined, undefined)
      .setParameters({ id: input.id })
      .getRawMany<ExpirePendingFindSolicitudCanjeNextRow>();
  }
}
