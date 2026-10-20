import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentityTables1792340000000 implements MigrationInterface {
  name = 'CreateIdentityTables1792340000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rol" (
        "id_rol" uuid NOT NULL DEFAULT gen_random_uuid(),
        "codigo" character varying(40) NOT NULL,
        "nombre" character varying(100) NOT NULL,
        "estructural" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_rol" PRIMARY KEY ("id_rol"),
        CONSTRAINT "uq_rol_codigo" UNIQUE ("codigo")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "usuario" (
        "id_usuario" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_rol" uuid NOT NULL,
        "correo_normalizado" character varying(320) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "version_acceso" integer NOT NULL DEFAULT 0,
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_usuario" PRIMARY KEY ("id_usuario"),
        CONSTRAINT "uq_usuario_correo_normalizado" UNIQUE ("correo_normalizado"),
        CONSTRAINT "ck_usuario_version_acceso" CHECK ("version_acceso" >= 0),
        CONSTRAINT "fk_usuario_rol" FOREIGN KEY ("id_rol")
          REFERENCES "rol"("id_rol") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "perfil" (
        "id_usuario" uuid NOT NULL,
        "nombres" character varying(160) NOT NULL,
        "apellidos" character varying(160),
        "telefono" character varying(20),
        CONSTRAINT "pk_perfil" PRIMARY KEY ("id_usuario"),
        CONSTRAINT "fk_perfil_usuario" FOREIGN KEY ("id_usuario")
          REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "cliente" (
        "id_cliente" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_usuario" uuid NOT NULL,
        "nombre_contacto" character varying(160),
        "telefono" character varying(20),
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_cliente" PRIMARY KEY ("id_cliente"),
        CONSTRAINT "uq_cliente_usuario" UNIQUE ("id_usuario"),
        CONSTRAINT "fk_cliente_usuario" FOREIGN KEY ("id_usuario")
          REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "sesion_usuario" (
        "id_sesion_usuario" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_usuario" uuid NOT NULL,
        "refresh_hash" character(64) NOT NULL,
        "generacion" integer NOT NULL DEFAULT 0,
        "creada_en" timestamptz NOT NULL DEFAULT now(),
        "expira_en" timestamptz NOT NULL,
        "revocada_en" timestamptz,
        CONSTRAINT "pk_sesion_usuario" PRIMARY KEY ("id_sesion_usuario"),
        CONSTRAINT "uq_sesion_usuario_refresh_hash" UNIQUE ("refresh_hash"),
        CONSTRAINT "ck_sesion_usuario_generacion" CHECK ("generacion" >= 0),
        CONSTRAINT "ck_sesion_usuario_expiracion" CHECK ("expira_en" > "creada_en"),
        CONSTRAINT "fk_sesion_usuario_usuario" FOREIGN KEY ("id_usuario")
          REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "ix_sesion_usuario_usuario_vigente" ON "sesion_usuario" ("id_usuario", "expira_en") WHERE "revocada_en" IS NULL',
    );
    await queryRunner.query(`
      INSERT INTO "rol" ("codigo", "nombre", "estructural") VALUES
        ('admin', 'Administrador', true),
        ('worker', 'Trabajador', true),
        ('client', 'Cliente', true)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "ix_sesion_usuario_usuario_vigente"');
    await queryRunner.query('DROP TABLE "sesion_usuario"');
    await queryRunner.query('DROP TABLE "cliente"');
    await queryRunner.query('DROP TABLE "perfil"');
    await queryRunner.query('DROP TABLE "usuario"');
    await queryRunner.query('DROP TABLE "rol"');
  }
}
