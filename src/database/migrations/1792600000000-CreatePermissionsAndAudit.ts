import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePermissionsAndAudit1792600000000 implements MigrationInterface {
  name = 'CreatePermissionsAndAudit1792600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "permiso" (
        "id_permiso" uuid NOT NULL DEFAULT gen_random_uuid(),
        "codigo" varchar(80) NOT NULL,
        "descripcion" varchar(200) NOT NULL,
        CONSTRAINT "pk_permiso" PRIMARY KEY ("id_permiso"),
        CONSTRAINT "uq_permiso_codigo" UNIQUE ("codigo")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "rol_permiso" (
        "id_rol" uuid NOT NULL,
        "id_permiso" uuid NOT NULL,
        CONSTRAINT "pk_rol_permiso" PRIMARY KEY ("id_rol", "id_permiso"),
        CONSTRAINT "fk_rol_permiso_rol" FOREIGN KEY ("id_rol") REFERENCES "rol"("id_rol") ON DELETE CASCADE,
        CONSTRAINT "fk_rol_permiso_permiso" FOREIGN KEY ("id_permiso") REFERENCES "permiso"("id_permiso") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "auditoria" (
        "id_evento" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actor_usuario_id" uuid,
        "actor_tipo" varchar(20) NOT NULL,
        "recurso_tipo" varchar(40) NOT NULL,
        "recurso_id" uuid,
        "evento" varchar(80) NOT NULL,
        "detalle" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "ocurrido_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_auditoria" PRIMARY KEY ("id_evento"),
        CONSTRAINT "fk_auditoria_actor_usuario" FOREIGN KEY ("actor_usuario_id") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE INDEX "ix_auditoria_recurso_fecha" ON "auditoria" ("recurso_tipo", "recurso_id", "ocurrido_en")');
    await queryRunner.query(`
      INSERT INTO "permiso" ("codigo", "descripcion") VALUES
        ('users.read', 'Consultar usuarios'), ('users.create', 'Crear usuarios'),
        ('users.update', 'Actualizar usuarios'), ('roles.read', 'Consultar roles y permisos'),
        ('catalog.read', 'Consultar catálogo administrativo'), ('catalog.write', 'Crear y editar catálogo'),
        ('catalog.visibility', 'Mostrar u ocultar productos')
    `);
    await queryRunner.query(`
      INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
      SELECT r."id_rol", p."id_permiso" FROM "rol" r CROSS JOIN "permiso" p WHERE r."codigo" = 'admin'
    `);
    await queryRunner.query(`
      INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
      SELECT r."id_rol", p."id_permiso" FROM "rol" r JOIN "permiso" p ON p."codigo" IN ('catalog.read', 'catalog.visibility')
      WHERE r."codigo" = 'worker'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "ix_auditoria_recurso_fecha"');
    await queryRunner.query('DROP TABLE "auditoria"');
    await queryRunner.query('DROP TABLE "rol_permiso"');
    await queryRunner.query('DROP TABLE "permiso"');
  }
}
