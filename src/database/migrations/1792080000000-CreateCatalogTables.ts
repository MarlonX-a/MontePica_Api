import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogTables1792080000000 implements MigrationInterface {
  name = 'CreateCatalogTables1792080000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categoria" (
        "id_categoria" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre_normalizado" character varying(160) NOT NULL,
        "nombre" character varying(160) NOT NULL,
        "activa" boolean NOT NULL DEFAULT true,
        "orden" integer NOT NULL DEFAULT 0,
        CONSTRAINT "pk_categoria" PRIMARY KEY ("id_categoria"),
        CONSTRAINT "uq_categoria_nombre_normalizado" UNIQUE ("nombre_normalizado"),
        CONSTRAINT "ck_categoria_orden_no_negativo" CHECK ("orden" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "producto" (
        "id_producto" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_categoria" uuid NOT NULL,
        "sku" character varying(80) NOT NULL,
        "nombre" character varying(180) NOT NULL,
        "descripcion" text,
        "precio_ctvs" integer NOT NULL,
        "imagen_url" text,
        "activo" boolean NOT NULL DEFAULT true,
        "visible_menu" boolean NOT NULL DEFAULT true,
        "controla_inventario" boolean NOT NULL DEFAULT true,
        "orden" integer NOT NULL DEFAULT 0,
        CONSTRAINT "pk_producto" PRIMARY KEY ("id_producto"),
        CONSTRAINT "uq_producto_sku" UNIQUE ("sku"),
        CONSTRAINT "ck_producto_precio_ctvs_no_negativo" CHECK ("precio_ctvs" >= 0),
        CONSTRAINT "ck_producto_orden_no_negativo" CHECK ("orden" >= 0),
        CONSTRAINT "fk_producto_categoria" FOREIGN KEY ("id_categoria")
          REFERENCES "categoria"("id_categoria") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "ix_producto_categoria_orden" ON "producto" ("id_categoria", "orden", "nombre")',
    );
    await queryRunner.query(
      'CREATE INDEX "ix_producto_menu_activo" ON "producto" ("activo", "visible_menu")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "ix_producto_menu_activo"');
    await queryRunner.query('DROP INDEX "ix_producto_categoria_orden"');
    await queryRunner.query('DROP TABLE "producto"');
    await queryRunner.query('DROP TABLE "categoria"');
  }
}
