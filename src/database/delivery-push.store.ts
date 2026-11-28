import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

type Decision = 'approved' | 'rejected';
type SendState = 'pending' | 'receipt' | 'accepted' | 'failed' | 'skipped';

export interface DeliveryPushJob {
  id: string;
  reservation: string;
  deviceId: string | null;
  decision: Decision;
  ticket: string | null;
  attempts: number;
  expired: boolean;
}

// The session and role are checked again immediately before contacting Expo.
const activeDevices = `
  FROM dispositivo_push d
  JOIN sesion_usuario s ON s.id_sesion_usuario = d.id_sesion
  JOIN usuario u ON u.id_usuario = s.id_usuario
  JOIN cliente c ON c.id_usuario = u.id_usuario
  JOIN rol r ON r.id_rol = u.id_rol
  WHERE s.revocada_en IS NULL AND s.expira_en > clock_timestamp()
    AND u.activo AND r.codigo = 'client'`;

@Injectable()
export class DeliveryPushStore {
  constructor(private readonly db: DataSource) {}

  async register(sessionId: string, token: string): Promise<void> {
    await this.db.transaction(async (m) => {
      // Serialize the short registry transaction across API instances.
      await m.query('SELECT pg_advisory_xact_lock(520000, 1)');
      const [session] = await m.query(
        `SELECT id_sesion_usuario FROM sesion_usuario
         WHERE id_sesion_usuario = $1 AND revocada_en IS NULL
           AND expira_en > clock_timestamp() FOR UPDATE`,
        [sessionId],
      );
      if (!session) throw new UnauthorizedException('Sesión no válida.');
      await m.query(
        `DELETE FROM dispositivo_push
         WHERE (id_sesion = $1 AND token <> $2) OR (token = $2 AND id_sesion <> $1)`,
        [sessionId, token],
      );
      await m.query(
        `INSERT INTO dispositivo_push(id_sesion, token) VALUES ($1, $2)
         ON CONFLICT (id_sesion) DO NOTHING`,
        [sessionId, token],
      );
    });
  }

  async unregister(sessionId: string): Promise<void> {
    await this.db.query('DELETE FROM dispositivo_push WHERE id_sesion = $1', [sessionId]);
  }

  async enqueue(m: EntityManager, requestId: string, clientId: string, decision: Decision): Promise<void> {
    await m.query(
      `WITH event AS (
         INSERT INTO evento_push_domicilio(id_solicitud, id_cliente, resultado)
         VALUES ($1, $2, $3) ON CONFLICT (id_solicitud, resultado) DO NOTHING
         RETURNING id
       )
       INSERT INTO envio_push_domicilio(id_evento, id_dispositivo)
       SELECT event.id, device.id
       FROM event CROSS JOIN (SELECT d.id ${activeDevices} AND c.id_cliente = $2) device`,
      [requestId, clientId, decision],
    );
  }

  async claim(): Promise<DeliveryPushJob | undefined> {
    const [job]: DeliveryPushJob[] = await this.db.query(`
      WITH next AS (
        SELECT p.id FROM envio_push_domicilio p
        WHERE p.estado IN ('pending', 'receipt') AND p.siguiente_en <= clock_timestamp()
        ORDER BY p.siguiente_en, p.id LIMIT 1 FOR UPDATE OF p SKIP LOCKED
      ), claimed AS (
        UPDATE envio_push_domicilio p
        SET reserva = gen_random_uuid(), siguiente_en = clock_timestamp() + interval '2 minutes',
            intentos = p.intentos + 1
        FROM next WHERE p.id = next.id RETURNING p.*
      )
      SELECT p.id, p.reserva AS reservation, p.id_dispositivo AS "deviceId",
             e.resultado AS decision, p.ticket, p.intentos AS attempts,
             p.creado_en <= clock_timestamp() - interval '24 hours' AS expired
      FROM claimed p JOIN evento_push_domicilio e ON e.id = p.id_evento
    `);
    return job;
  }

  async token(job: DeliveryPushJob): Promise<string | undefined> {
    const [row]: { token: string }[] = await this.db.query(
      `SELECT d.token ${activeDevices}
       AND d.id = $1 AND c.id_cliente = (
         SELECT e.id_cliente FROM envio_push_domicilio p
         JOIN evento_push_domicilio e ON e.id = p.id_evento WHERE p.id = $2
       )`,
      [job.deviceId, job.id],
    );
    return row?.token;
  }

  async save(job: DeliveryPushJob, state: SendState, delay = 0, ticket = job.ticket): Promise<void> {
    await this.db.query(
      `UPDATE envio_push_domicilio
       SET estado = $3, ticket = $4, siguiente_en = clock_timestamp() + $5 * interval '1 second',
           reserva = NULL, intentos = CASE WHEN ticket IS DISTINCT FROM $4 THEN 0 ELSE intentos END
       WHERE id = $1 AND reserva = $2`,
      [job.id, job.reservation, state, ticket, delay],
    );
  }

  async invalidate(job: DeliveryPushJob): Promise<void> {
    await this.db.query('DELETE FROM dispositivo_push WHERE id = $1', [job.deviceId]);
  }
}
