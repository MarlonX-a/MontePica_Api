import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordRecovery1795100000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE recuperacion_limite (
      clave text PRIMARY KEY, vence_en timestamptz NOT NULL, intentos integer NOT NULL
    )`);
    await q.query(
      `CREATE INDEX ix_recuperacion_limite_vence ON recuperacion_limite(vence_en)`,
    );
    await q.query(`CREATE TABLE recuperacion_envio (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      correo varchar(320) NOT NULL,
      id_usuario uuid,
      version_acceso integer,
      creada_en timestamptz NOT NULL DEFAULT clock_timestamp(),
      siguiente_en timestamptz NOT NULL DEFAULT clock_timestamp(),
      intentos integer NOT NULL DEFAULT 0
    )`);
    await q.query(
      `CREATE INDEX ix_recuperacion_envio_siguiente ON recuperacion_envio(siguiente_en, id)`,
    );
    await q.query(`CREATE TABLE recuperacion_token (
      id_usuario uuid PRIMARY KEY REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      hash char(64) NOT NULL UNIQUE,
      id_envio bigint NOT NULL,
      version_acceso integer NOT NULL,
      vence_en timestamptz NOT NULL,
      usado_en timestamptz
    )`);
    await q.query(
      `CREATE INDEX ix_recuperacion_token_vence ON recuperacion_token(vence_en)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE recuperacion_token, recuperacion_envio, recuperacion_limite',
    );
  }
}
