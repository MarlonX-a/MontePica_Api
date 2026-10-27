import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDailyInventory1793500000000 implements MigrationInterface {
  name = 'CreateDailyInventory1793500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inventario_diario" (
        "id_inventario" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_jornada" uuid NOT NULL,
        "id_producto" uuid NOT NULL,
        "cantidad_inicial" integer NOT NULL,
        "cantidad_fisica" integer NOT NULL,
        "cantidad_reservada" integer NOT NULL DEFAULT 0,
        "inicializado_por" uuid NOT NULL,
        "inicializado_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inventario_diario" PRIMARY KEY ("id_inventario"),
        CONSTRAINT "uq_inventario_diario_jornada_producto" UNIQUE ("id_jornada", "id_producto"),
        CONSTRAINT "ck_inventario_diario_cantidad_inicial" CHECK ("cantidad_inicial" >= 0),
        CONSTRAINT "ck_inventario_diario_cantidad_fisica" CHECK ("cantidad_fisica" >= 0),
        CONSTRAINT "ck_inventario_diario_cantidad_reservada" CHECK ("cantidad_reservada" >= 0 AND "cantidad_reservada" <= "cantidad_fisica"),
        CONSTRAINT "fk_inventario_diario_jornada" FOREIGN KEY ("id_jornada")
          REFERENCES "jornada_operativa"("id_jornada") ON DELETE RESTRICT,
        CONSTRAINT "fk_inventario_diario_producto" FOREIGN KEY ("id_producto")
          REFERENCES "producto"("id_producto") ON DELETE RESTRICT,
        CONSTRAINT "fk_inventario_diario_usuario" FOREIGN KEY ("inicializado_por")
          REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "ix_inventario_diario_jornada" ON "inventario_diario" ("id_jornada", "id_producto")',
    );
    await queryRunner.query(`
      CREATE TABLE "movimiento_inventario" (
        "id_movimiento" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_inventario" uuid NOT NULL,
        "registrado_por" uuid NOT NULL,
        "tipo" varchar(32) NOT NULL,
        "delta_fisico" integer NOT NULL,
        "cantidad_anterior" integer NOT NULL,
        "cantidad_posterior" integer NOT NULL,
        "motivo" varchar(500) NOT NULL,
        "ocurrido_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_movimiento_inventario" PRIMARY KEY ("id_movimiento"),
        CONSTRAINT "ck_movimiento_inventario_tipo" CHECK ("tipo" IN ('initialization', 'restock', 'internalConsumption', 'giveaway', 'waste', 'adjustment')),
        CONSTRAINT "ck_movimiento_inventario_cantidades" CHECK ("cantidad_anterior" >= 0 AND "cantidad_posterior" >= 0),
        CONSTRAINT "ck_movimiento_inventario_delta" CHECK ("cantidad_posterior" - "cantidad_anterior" = "delta_fisico"),
        CONSTRAINT "fk_movimiento_inventario_inventario" FOREIGN KEY ("id_inventario")
          REFERENCES "inventario_diario"("id_inventario") ON DELETE RESTRICT,
        CONSTRAINT "fk_movimiento_inventario_usuario" FOREIGN KEY ("registrado_por")
          REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "ix_movimiento_inventario_inventario_fecha" ON "movimiento_inventario" ("id_inventario", "ocurrido_en" DESC, "id_movimiento" DESC)',
    );
    await queryRunner.query(`
      CREATE FUNCTION "rechazar_cambio_movimiento_inventario"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Los movimientos de inventario son inmutables.' USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "tr_movimiento_inventario_inmutable"
      BEFORE UPDATE OR DELETE ON "movimiento_inventario"
      FOR EACH ROW EXECUTE FUNCTION "rechazar_cambio_movimiento_inventario"()
    `);
    await queryRunner.query(`
      CREATE TABLE "idempotencia" (
        "id_idempotencia" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actor_usuario_id" uuid NOT NULL,
        "actor_tipo" varchar(20) NOT NULL DEFAULT 'usuario',
        "operacion" varchar(160) NOT NULL,
        "clave" varchar(128) NOT NULL,
        "solicitud_hash" char(64) NOT NULL,
        "estado_http" smallint NOT NULL,
        "respuesta" jsonb NOT NULL,
        "recurso_tipo" varchar(40) NOT NULL,
        "recurso_id" uuid,
        "creada_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_idempotencia" PRIMARY KEY ("id_idempotencia"),
        CONSTRAINT "uq_idempotencia_actor_operacion_clave" UNIQUE ("actor_usuario_id", "actor_tipo", "operacion", "clave"),
        CONSTRAINT "ck_idempotencia_estado_http" CHECK ("estado_http" BETWEEN 200 AND 299),
        CONSTRAINT "fk_idempotencia_usuario" FOREIGN KEY ("actor_usuario_id")
          REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "ix_idempotencia_creada_en" ON "idempotencia" ("creada_en")',
    );
    await queryRunner.query(`
      INSERT INTO "permiso" ("codigo", "descripcion") VALUES
        ('inventory.read', 'Consultar inventario diario y movimientos'),
        ('inventory.initialize', 'Inicializar existencias de una jornada'),
        ('inventory.move', 'Registrar movimientos ordinarios de inventario'),
        ('inventory.adjust', 'Ajustar inventario mediante conteo físico')
    `);
    await queryRunner.query(`
      INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
      SELECT r."id_rol", p."id_permiso" FROM "rol" r CROSS JOIN "permiso" p
      WHERE r."codigo" = 'admin' AND p."codigo" IN ('inventory.read', 'inventory.initialize', 'inventory.move', 'inventory.adjust')
    `);
    await queryRunner.query(`
      INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
      SELECT r."id_rol", p."id_permiso" FROM "rol" r CROSS JOIN "permiso" p
      WHERE r."codigo" = 'worker' AND p."codigo" IN ('inventory.read', 'inventory.move')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "ix_idempotencia_creada_en"');
    await queryRunner.query('DROP TABLE "idempotencia"');
    await queryRunner.query('DROP INDEX "ix_movimiento_inventario_inventario_fecha"');
    await queryRunner.query('DROP TABLE "movimiento_inventario"');
    await queryRunner.query('DROP FUNCTION "rechazar_cambio_movimiento_inventario"()');
    await queryRunner.query('DROP INDEX "ix_inventario_diario_jornada"');
    await queryRunner.query('DROP TABLE "inventario_diario"');
    await queryRunner.query(`
      DELETE FROM "rol_permiso" WHERE "id_permiso" IN (
        SELECT "id_permiso" FROM "permiso" WHERE "codigo" IN
          ('inventory.read', 'inventory.initialize', 'inventory.move', 'inventory.adjust')
      )
    `);
    await queryRunner.query(
      `DELETE FROM "permiso" WHERE "codigo" IN ('inventory.read', 'inventory.initialize', 'inventory.move', 'inventory.adjust')`,
    );
  }
}
