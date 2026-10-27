import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTableVisits1793600000000 implements MigrationInterface {
  name = 'CreateTableVisits1793600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "cliente" ALTER COLUMN "id_usuario" DROP NOT NULL`);
    await q.query(`CREATE TABLE "sesion_cliente" (
      "id_sesion_cliente" uuid NOT NULL DEFAULT gen_random_uuid(), "id_cliente" uuid NOT NULL,
      "token_hash" char(64) NOT NULL, "creada_en" timestamptz NOT NULL DEFAULT now(),
      "expira_en" timestamptz NOT NULL, "revocada_en" timestamptz,
      CONSTRAINT "pk_sesion_cliente" PRIMARY KEY ("id_sesion_cliente"),
      CONSTRAINT "uq_sesion_cliente_token_hash" UNIQUE ("token_hash"),
      CONSTRAINT "ck_sesion_cliente_expira" CHECK ("expira_en" > "creada_en"),
      CONSTRAINT "fk_sesion_cliente_cliente" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "ix_sesion_cliente_vigente" ON "sesion_cliente" ("id_cliente", "expira_en") WHERE "revocada_en" IS NULL`);
    await q.query(`CREATE TABLE "mesa" (
      "id_mesa" uuid NOT NULL DEFAULT gen_random_uuid(), "codigo" varchar(40) NOT NULL,
      "qr_hash" char(64), "qr_version" integer NOT NULL DEFAULT 0, "activa" boolean NOT NULL DEFAULT true,
      CONSTRAINT "pk_mesa" PRIMARY KEY ("id_mesa"), CONSTRAINT "uq_mesa_codigo" UNIQUE ("codigo"),
      CONSTRAINT "uq_mesa_qr_hash" UNIQUE ("qr_hash"), CONSTRAINT "ck_mesa_qr_version" CHECK ("qr_version" >= 0))`);
    await q.query(`CREATE TABLE "visita_mesa" (
      "id_visita" uuid NOT NULL DEFAULT gen_random_uuid(), "id_mesa" uuid NOT NULL,
      "id_jornada" uuid NOT NULL, "abierta_por" uuid NOT NULL, "cerrada_por" uuid,
      "estado" varchar(16) NOT NULL DEFAULT 'open', "abierta_en" timestamptz NOT NULL DEFAULT now(), "cerrada_en" timestamptz,
      CONSTRAINT "pk_visita_mesa" PRIMARY KEY ("id_visita"),
      CONSTRAINT "ck_visita_mesa_estado" CHECK ("estado" IN ('open','closed')),
      CONSTRAINT "ck_visita_mesa_fechas" CHECK (("estado"='open' AND "cerrada_en" IS NULL) OR ("estado"='closed' AND "cerrada_en" IS NOT NULL)),
      CONSTRAINT "fk_visita_mesa_mesa" FOREIGN KEY ("id_mesa") REFERENCES "mesa"("id_mesa") ON DELETE RESTRICT,
      CONSTRAINT "fk_visita_mesa_jornada" FOREIGN KEY ("id_jornada") REFERENCES "jornada_operativa"("id_jornada") ON DELETE RESTRICT,
      CONSTRAINT "fk_visita_mesa_abierta_por" FOREIGN KEY ("abierta_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT,
      CONSTRAINT "fk_visita_mesa_cerrada_por" FOREIGN KEY ("cerrada_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT)`);
    await q.query(`CREATE UNIQUE INDEX "uq_visita_mesa_abierta" ON "visita_mesa" ("id_mesa") WHERE "estado"='open'`);
    await q.query(`CREATE TABLE "participante" (
      "id_participante" uuid NOT NULL DEFAULT gen_random_uuid(), "id_visita" uuid NOT NULL,
      "id_cliente" uuid NOT NULL, "sesion_origen_id" uuid, "solicitada_desde" uuid,
      "aprobada_por" uuid, "alias" varchar(80) NOT NULL, "estado" varchar(16) NOT NULL DEFAULT 'pending',
      "qr_version_aprobada" integer, "solicitada_en" timestamptz NOT NULL DEFAULT now(), "aprobada_en" timestamptz,
      "finalizada_en" timestamptz, "motivo_rechazo" varchar(500),
      CONSTRAINT "pk_participante" PRIMARY KEY ("id_participante"),
      CONSTRAINT "uq_participante_visita_cliente" UNIQUE ("id_visita","id_cliente"),
      CONSTRAINT "ck_participante_estado" CHECK ("estado" IN ('pending','approved','rejected','cancelled','finished')),
      CONSTRAINT "ck_participante_version" CHECK ("qr_version_aprobada" IS NULL OR "qr_version_aprobada">=1),
      CONSTRAINT "fk_participante_visita" FOREIGN KEY ("id_visita") REFERENCES "visita_mesa"("id_visita") ON DELETE RESTRICT,
      CONSTRAINT "fk_participante_cliente" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT,
      CONSTRAINT "fk_participante_sesion" FOREIGN KEY ("sesion_origen_id") REFERENCES "sesion_cliente"("id_sesion_cliente") ON DELETE SET NULL,
      CONSTRAINT "fk_participante_solicitada_desde" FOREIGN KEY ("solicitada_desde") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL,
      CONSTRAINT "fk_participante_aprobada_por" FOREIGN KEY ("aprobada_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT)`);
    await q.query(`CREATE UNIQUE INDEX "uq_participante_cliente_activo" ON "participante" ("id_cliente") WHERE "estado"='approved'`);
    await q.query(`CREATE INDEX "ix_participante_visita_estado" ON "participante" ("id_visita","estado","solicitada_en")`);
    await q.query(`CREATE TABLE "cuenta_consumo" (
      "id_cuenta" uuid NOT NULL DEFAULT gen_random_uuid(), "id_cliente" uuid NOT NULL,
      "id_participante" uuid NOT NULL, "id_jornada" uuid NOT NULL, "modalidad" varchar(16) NOT NULL DEFAULT 'local',
      "estado" varchar(16) NOT NULL DEFAULT 'open', "creada_en" timestamptz NOT NULL DEFAULT now(), "cerrada_en" timestamptz,
      CONSTRAINT "pk_cuenta_consumo" PRIMARY KEY ("id_cuenta"), CONSTRAINT "uq_cuenta_participante" UNIQUE ("id_participante"),
      CONSTRAINT "ck_cuenta_modalidad" CHECK ("modalidad"='local'), CONSTRAINT "ck_cuenta_estado" CHECK ("estado" IN ('open','closed')),
      CONSTRAINT "fk_cuenta_cliente" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("id_cliente") ON DELETE RESTRICT,
      CONSTRAINT "fk_cuenta_participante" FOREIGN KEY ("id_participante") REFERENCES "participante"("id_participante") ON DELETE RESTRICT,
      CONSTRAINT "fk_cuenta_jornada" FOREIGN KEY ("id_jornada") REFERENCES "jornada_operativa"("id_jornada") ON DELETE RESTRICT)`);
    await q.query(`ALTER TABLE "auditoria" ADD COLUMN "actor_sesion_cliente_id" uuid REFERENCES "sesion_cliente"("id_sesion_cliente") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "idempotencia" ALTER COLUMN "actor_usuario_id" DROP NOT NULL`);
    await q.query(`ALTER TABLE "idempotencia" ADD COLUMN "actor_sesion_cliente_id" uuid REFERENCES "sesion_cliente"("id_sesion_cliente") ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE "idempotencia" DROP CONSTRAINT "uq_idempotencia_actor_operacion_clave"`);
    await q.query(`CREATE UNIQUE INDEX "uq_idempotencia_usuario_op_key" ON "idempotencia" ("actor_usuario_id","operacion","clave") WHERE "actor_usuario_id" IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX "uq_idempotencia_cliente_sesion_op_key" ON "idempotencia" ("actor_sesion_cliente_id","operacion","clave") WHERE "actor_sesion_cliente_id" IS NOT NULL`);
    await q.query(`INSERT INTO "permiso" ("codigo","descripcion") VALUES ('tables.read','Consultar mesas'),('tables.manage','Administrar mesas'),('visits.read','Consultar visitas'),('visits.manage','Gestionar visitas'),('participants.manage','Gestionar solicitudes de participantes')`);
    await q.query(`INSERT INTO "rol_permiso" SELECT r."id_rol",p."id_permiso" FROM "rol" r CROSS JOIN "permiso" p WHERE r."codigo" IN ('admin','worker') AND p."codigo" IN ('tables.read','visits.read','visits.manage','participants.manage') OR r."codigo"='admin' AND p."codigo"='tables.manage'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "rol_permiso" WHERE "id_permiso" IN (SELECT "id_permiso" FROM "permiso" WHERE "codigo" IN ('tables.read','tables.manage','visits.read','visits.manage','participants.manage'))`);
    await q.query(`DELETE FROM "permiso" WHERE "codigo" IN ('tables.read','tables.manage','visits.read','visits.manage','participants.manage')`);
    await q.query(`DROP INDEX "uq_idempotencia_cliente_sesion_op_key"`);
    await q.query(`DROP INDEX "uq_idempotencia_usuario_op_key"`);
    await q.query(`ALTER TABLE "idempotencia" ADD CONSTRAINT "uq_idempotencia_actor_operacion_clave" UNIQUE ("actor_usuario_id","actor_tipo","operacion","clave")`);
    await q.query(`ALTER TABLE "idempotencia" DROP COLUMN "actor_sesion_cliente_id"`);
    await q.query(`ALTER TABLE "idempotencia" ALTER COLUMN "actor_usuario_id" SET NOT NULL`);
    await q.query(`ALTER TABLE "auditoria" DROP COLUMN "actor_sesion_cliente_id"`);
    await q.query(`DROP TABLE "cuenta_consumo"`);
    await q.query(`DROP INDEX "ix_participante_visita_estado"`);
    await q.query(`DROP INDEX "uq_participante_cliente_activo"`);
    await q.query(`DROP TABLE "participante"`);
    await q.query(`DROP INDEX "uq_visita_mesa_abierta"`);
    await q.query(`DROP TABLE "visita_mesa"`);
    await q.query(`DROP TABLE "mesa"`);
    await q.query(`DROP INDEX "ix_sesion_cliente_vigente"`);
    await q.query(`DROP TABLE "sesion_cliente"`);
    await q.query(`ALTER TABLE "cliente" ALTER COLUMN "id_usuario" SET NOT NULL`);
  }
}
