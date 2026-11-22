import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

export interface RecoveryJob {
  id: string;
  correo: string;
  id_usuario: string | null;
  version_acceso: number | null;
  intentos: number;
}

@Injectable()
export class PasswordRecoveryStore {
  async enqueue(manager: EntityManager, email: string): Promise<void> {
    await manager.query(
      `INSERT INTO recuperacion_envio(correo, id_usuario, version_acceso)
       SELECT $1, u.id_usuario, u.version_acceso FROM (SELECT 1) AS solicitud
       LEFT JOIN usuario u ON u.correo_normalizado = $1 AND u.activo`,
      [email],
    );
  }

  async candidate(
    manager: EntityManager,
    hash: string,
  ): Promise<string | undefined> {
    const [row]: { id_usuario: string }[] = await manager.query(
      `SELECT id_usuario FROM recuperacion_token
       WHERE hash = $1 AND usado_en IS NULL AND vence_en > clock_timestamp()`,
      [hash],
    );
    return row?.id_usuario;
  }

  async consume(
    manager: EntityManager,
    userId: string,
    hash: string,
    version: number,
  ): Promise<boolean> {
    const [row]: { id_usuario: string }[] = await manager.query(
      `WITH consumed AS (
         UPDATE recuperacion_token SET usado_en = clock_timestamp()
         WHERE id_usuario = $1 AND hash = $2 AND version_acceso = $3
           AND usado_en IS NULL AND vence_en > clock_timestamp()
         RETURNING id_usuario
       ) SELECT id_usuario FROM consumed`,
      [userId, hash, version],
    );
    return !!row;
  }

  async allow(
    manager: EntityManager,
    key: string,
    limit: number,
  ): Promise<boolean> {
    const [row]: { intentos: number }[] = await manager.query(
      `INSERT INTO recuperacion_limite AS l (clave, vence_en, intentos)
       VALUES ($1, clock_timestamp() + interval '1 hour', 1)
       ON CONFLICT (clave) DO UPDATE SET
         intentos = CASE WHEN l.vence_en <= clock_timestamp() THEN 1 ELSE l.intentos + 1 END,
         vence_en = CASE WHEN l.vence_en <= clock_timestamp() THEN excluded.vence_en ELSE l.vence_en END
       WHERE l.vence_en <= clock_timestamp() OR l.intentos < $2
       RETURNING intentos`,
      [key, limit],
    );
    return !!row;
  }

  async clean(manager: EntityManager, maxAttempts: number): Promise<void> {
    await manager.query(
      'DELETE FROM recuperacion_limite WHERE vence_en <= clock_timestamp()',
    );
    // Keep the generation marker until any older job is too old to be retried.
    await manager.query(
      "DELETE FROM recuperacion_token WHERE vence_en <= clock_timestamp() - interval '30 minutes'",
    );
    await manager.query(
      `DELETE FROM recuperacion_envio
      WHERE siguiente_en <= clock_timestamp()
      AND (intentos >= $1 OR creada_en <= clock_timestamp() - interval '30 minutes')`,
      [maxAttempts],
    );
  }

  async claim(
    manager: EntityManager,
    maxAttempts: number,
  ): Promise<RecoveryJob | undefined> {
    const [job]: RecoveryJob[] = await manager.query(
      `SELECT id, correo, id_usuario, version_acceso, intentos FROM recuperacion_envio
       WHERE siguiente_en <= clock_timestamp() AND intentos < $1
         AND creada_en > clock_timestamp() - interval '30 minutes'
       ORDER BY siguiente_en, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [maxAttempts],
    );
    return job;
  }

  async issue(
    manager: EntityManager,
    job: RecoveryJob,
    hash: string,
  ): Promise<boolean> {
    const [row]: { id_usuario: string }[] = await manager.query(
      `INSERT INTO recuperacion_token AS t (id_usuario, hash, id_envio, version_acceso, vence_en)
       VALUES ($1, $2, $3, $4, clock_timestamp() + interval '15 minutes')
       ON CONFLICT (id_usuario) DO UPDATE SET hash = excluded.hash, id_envio = excluded.id_envio,
         version_acceso = excluded.version_acceso, vence_en = excluded.vence_en, usado_en = NULL
       WHERE t.id_envio <= excluded.id_envio
       RETURNING id_usuario`,
      [job.id_usuario, hash, job.id, job.version_acceso],
    );
    return !!row;
  }

  async lease(manager: EntityManager, job: RecoveryJob): Promise<void> {
    await manager.query(
      `UPDATE recuperacion_envio SET intentos = $2,
       siguiente_en = clock_timestamp() + interval '2 minutes' WHERE id = $1`,
      [job.id, job.intentos],
    );
  }

  async retry(manager: EntityManager, job: RecoveryJob): Promise<void> {
    await manager.query(
      `UPDATE recuperacion_envio SET siguiente_en = clock_timestamp() + interval '30 seconds'
       WHERE id = $1 AND intentos = $2`,
      [job.id, job.intentos],
    );
  }

  async remove(manager: EntityManager, job: RecoveryJob): Promise<void> {
    await manager.query(
      'DELETE FROM recuperacion_envio WHERE id = $1 AND intentos = $2',
      [job.id, job.intentos],
    );
  }
}
