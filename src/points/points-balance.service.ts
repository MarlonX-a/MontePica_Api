import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { Client } from '../common/identity/entities/client.entity.js';
import {
  type BalanceFindMovimientoPuntosRow,
  type RequireClientFindClienteRow,
} from './types/points.types.js';

@Injectable()
export class PointsBalanceService {
  async getBalance(clientId: string, manager: EntityManager) {
    await this.requireClient(clientId, manager);
    const [row] = await this.findBalance(manager, clientId);
    if (
      ![row.balance, row.pending, row.reserved].every((value) =>
        Number.isSafeInteger(Number(value)),
      )
    ) {
      throw new ConflictException('Saldo fuera del rango seguro.');
    }

    const balance = Number(row.balance);
    const reservedPoints = Number(row.reserved);
    const available = BigInt(row.balance) - BigInt(row.reserved);
    return {
      balance,
      pendingPoints: Number(row.pending),
      reservedPoints,
      availablePoints: Number(available > 0n ? available : 0n),
    };
  }

  async requireClient(clientId: string, manager: EntityManager): Promise<void> {
    const [client] = await manager
      .getRepository(Client)
      .createQueryBuilder('cliente')
      .select('1 AS "1"')
      .where('id_cliente=:id')
      .setParameters({ id: clientId })
      .getRawMany<RequireClientFindClienteRow>();
    if (!client) throw new NotFoundException('Cliente no encontrado.');
  }

  private findBalance(
    manager: EntityManager,
    clientId: string,
  ): Promise<BalanceFindMovimientoPuntosRow[]> {
    return manager
      .createQueryBuilder()
      .select(
        "COALESCE((SELECT sum(puntos) FROM movimiento_puntos WHERE id_cliente=:clientId),0)::text balance, COALESCE((SELECT sum(puntos) FROM acumulacion_puntos WHERE id_cliente=:clientId AND estado='pending'),0)::text pending, COALESCE((SELECT sum(puntos) FROM reserva_puntos_canje WHERE id_cliente=:clientId AND estado='active'),0)::text reserved",
      )
      .from('(SELECT 1)', '_singleton')
      .setParameters({ clientId })
      .getRawMany<BalanceFindMovimientoPuntosRow>();
  }
}
