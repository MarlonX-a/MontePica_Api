import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Participant } from '../participants/entities/participant.entity.js';
import { ConsumptionAccount } from './entities/consumption-account.entity.js';

@Injectable()
export class AccountLifecycleService {
  async resolveParticipant(
    manager: EntityManager,
    input: {
      id: string;
      next: 'rejected' | 'cancelled' | 'finished';
      reason: string | null;
    },
  ): Promise<void> {
    await manager
      .getRepository(Participant)
      .createQueryBuilder()
      .update(Participant)
      .set({
        estado: input.next,
        finalizada_en: () => 'clock_timestamp()',
        motivo_rechazo: input.reason,
      })
      .where('"id_participante"=:id')
      .setParameters({ id: input.id })
      .execute();
  }

  async closeParticipantAccount(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder()
      .update(ConsumptionAccount)
      .set({ estado: 'closed', cerrada_en: () => 'clock_timestamp()' })
      .where('"id_participante"=:id AND "estado"=\'open\'')
      .setParameters({ id: input.id })
      .execute();
  }

  async closeVisitAccounts(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder()
      .update(ConsumptionAccount)
      .set({ estado: 'closed', cerrada_en: () => 'clock_timestamp()' })
      .where(
        '"id_participante" IN (SELECT "id_participante" FROM "participante" WHERE "id_visita"=:id AND "estado"=\'approved\') AND "estado"=\'open\'',
      )
      .setParameters({ id: input.id })
      .execute();
  }

  async finishVisitParticipants(
    manager: EntityManager,
    input: { id: string },
  ): Promise<void> {
    await manager
      .getRepository(Participant)
      .createQueryBuilder()
      .update(Participant)
      .set({
        estado: () =>
          "CASE WHEN \"estado\"='pending' THEN 'cancelled' ELSE 'finished' END",
        finalizada_en: () => 'clock_timestamp()',
      })
      .where('"id_visita"=:id AND "estado" IN (\'pending\',\'approved\')')
      .setParameters({ id: input.id })
      .execute();
  }

  async closeAccount(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager
      .getRepository(ConsumptionAccount)
      .createQueryBuilder()
      .update(ConsumptionAccount)
      .set({ estado: 'closed', cerrada_en: () => 'clock_timestamp()' })
      .where('id_cuenta=:id_cuenta')
      .setParameters({ id_cuenta: input.id_cuenta })
      .execute();
  }

  async finishParticipant(
    manager: EntityManager,
    input: { id_participante: string },
  ): Promise<void> {
    await manager
      .getRepository(Participant)
      .createQueryBuilder()
      .update(Participant)
      .set({ estado: 'finished', finalizada_en: () => 'clock_timestamp()' })
      .where('id_participante=:id_participante')
      .setParameters({ id_participante: input.id_participante })
      .execute();
  }
}
