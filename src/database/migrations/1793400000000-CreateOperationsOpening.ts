import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOperationsOpening1793400000000 implements MigrationInterface {
  name = 'CreateOperationsOpening1793400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "configuracion_operativa" (
        "id_configuracion" smallint NOT NULL DEFAULT 1,
        "zona_horaria" varchar(80) NOT NULL DEFAULT 'America/Guayaquil',
        "hora_apertura" time NOT NULL DEFAULT '09:00',
        "hora_cierre" time NOT NULL DEFAULT '22:00',
        "actualizada_en" timestamptz NOT NULL DEFAULT now(),
        "actualizada_por" uuid,
        CONSTRAINT "pk_configuracion_operativa" PRIMARY KEY ("id_configuracion"),
        CONSTRAINT "ck_configuracion_operativa_singleton" CHECK ("id_configuracion" = 1),
        CONSTRAINT "fk_configuracion_operativa_usuario" FOREIGN KEY ("actualizada_por")
          REFERENCES "usuario"("id_usuario") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO "configuracion_operativa" ("id_configuracion") VALUES (1)
    `);
    await queryRunner.query(`
      CREATE TABLE "jornada_operativa" (
        "id_jornada" uuid NOT NULL DEFAULT gen_random_uuid(),
        "fecha_operativa" date NOT NULL,
        "estado" varchar(16) NOT NULL DEFAULT 'open',
        "abierta_en" timestamptz NOT NULL DEFAULT now(),
        "abierta_por" uuid NOT NULL,
        CONSTRAINT "pk_jornada_operativa" PRIMARY KEY ("id_jornada"),
        CONSTRAINT "uq_jornada_operativa_fecha" UNIQUE ("fecha_operativa"),
        CONSTRAINT "ck_jornada_operativa_estado" CHECK ("estado" IN ('open', 'closed')),
        CONSTRAINT "fk_jornada_operativa_usuario" FOREIGN KEY ("abierta_por")
          REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "caja" (
        "id_caja" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_jornada" uuid NOT NULL,
        "estado" varchar(16) NOT NULL DEFAULT 'open',
        "monto_inicial_ctvs" integer NOT NULL,
        "abierta_en" timestamptz NOT NULL DEFAULT now(),
        "abierta_por" uuid NOT NULL,
        CONSTRAINT "pk_caja" PRIMARY KEY ("id_caja"),
        CONSTRAINT "uq_caja_jornada" UNIQUE ("id_jornada"),
        CONSTRAINT "ck_caja_estado" CHECK ("estado" IN ('open', 'closed')),
        CONSTRAINT "ck_caja_monto_inicial_no_negativo" CHECK ("monto_inicial_ctvs" >= 0),
        CONSTRAINT "fk_caja_jornada" FOREIGN KEY ("id_jornada")
          REFERENCES "jornada_operativa"("id_jornada") ON DELETE RESTRICT,
        CONSTRAINT "fk_caja_usuario" FOREIGN KEY ("abierta_por")
          REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      INSERT INTO "permiso" ("codigo", "descripcion") VALUES
        ('operations.read', 'Consultar configuración y jornada operativa'),
        ('operations.manage', 'Actualizar configuración operativa'),
        ('operations.open', 'Abrir jornada y caja')
    `);
    await queryRunner.query(`
      INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
      SELECT r."id_rol", p."id_permiso" FROM "rol" r CROSS JOIN "permiso" p
      WHERE r."codigo" = 'admin' AND p."codigo" IN ('operations.read', 'operations.manage', 'operations.open')
    `);
    await queryRunner.query(`
      INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
      SELECT r."id_rol", p."id_permiso" FROM "rol" r CROSS JOIN "permiso" p
      WHERE r."codigo" = 'worker' AND p."codigo" IN ('operations.read', 'operations.open')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "caja"');
    await queryRunner.query('DROP TABLE "jornada_operativa"');
    await queryRunner.query('DROP TABLE "configuracion_operativa"');
    await queryRunner.query(`
      DELETE FROM "rol_permiso" WHERE "id_permiso" IN (
        SELECT "id_permiso" FROM "permiso" WHERE "codigo" IN ('operations.read', 'operations.manage', 'operations.open')
      )
    `);
    await queryRunner.query(
      `DELETE FROM "permiso" WHERE "codigo" IN ('operations.read', 'operations.manage', 'operations.open')`,
    );
  }
}
