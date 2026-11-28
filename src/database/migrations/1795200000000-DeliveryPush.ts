import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class DeliveryPush1795200000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE dispositivo_push (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        id_sesion uuid NOT NULL UNIQUE REFERENCES sesion_usuario(id_sesion_usuario) ON DELETE CASCADE,
        token varchar(200) NOT NULL UNIQUE
      );
      CREATE TABLE evento_push_domicilio (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        id_solicitud uuid NOT NULL REFERENCES solicitud_domicilio(id_solicitud) ON DELETE CASCADE,
        id_cliente uuid NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
        resultado varchar(8) NOT NULL CHECK (resultado IN ('approved', 'rejected')),
        UNIQUE (id_solicitud, resultado)
      );
      CREATE TABLE envio_push_domicilio (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        id_evento uuid NOT NULL REFERENCES evento_push_domicilio(id) ON DELETE CASCADE,
        id_dispositivo uuid REFERENCES dispositivo_push(id) ON DELETE SET NULL,
        estado varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (estado IN ('pending', 'receipt', 'accepted', 'failed', 'skipped')),
        ticket text,
        intentos integer NOT NULL DEFAULT 0,
        siguiente_en timestamptz NOT NULL DEFAULT clock_timestamp(),
        creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
        reserva uuid,
        UNIQUE (id_evento, id_dispositivo)
      );
      CREATE INDEX ix_envio_push_pendiente ON envio_push_domicilio(siguiente_en, id)
        WHERE estado IN ('pending', 'receipt');
      CREATE INDEX ix_envio_push_dispositivo ON envio_push_domicilio(id_dispositivo);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE envio_push_domicilio, evento_push_domicilio, dispositivo_push');
  }
}
