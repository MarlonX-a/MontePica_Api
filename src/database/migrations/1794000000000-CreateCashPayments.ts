import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashPayments1794000000000 implements MigrationInterface {
  name = 'CreateCashPayments1794000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE liquidacion DROP CONSTRAINT liquidacion_estado_check, ADD CONSTRAINT liquidacion_estado_check CHECK (estado IN ('pending','cancelled','settled'))`);
    await q.query(`ALTER TABLE liquidacion DROP CONSTRAINT liquidacion_check1, ADD CONSTRAINT liquidacion_check1 CHECK ((estado IN ('pending','settled') AND anulada_por IS NULL AND anulada_en IS NULL AND motivo_anulacion IS NULL) OR (estado='cancelled' AND anulada_por IS NOT NULL AND anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND length(trim(motivo_anulacion))>0))`);
    await q.query(`ALTER TABLE liquidacion ADD COLUMN cerrada_en timestamptz, ADD COLUMN cerrada_por uuid REFERENCES usuario(id_usuario) ON DELETE RESTRICT, ADD COLUMN resolucion varchar(16), ADD CONSTRAINT ck_liquidacion_resolucion CHECK ((estado='settled' AND cerrada_en IS NOT NULL AND cerrada_por IS NOT NULL AND resolucion IS NOT NULL AND resolucion IN ('cash','zeroTotal')) OR (estado<>'settled' AND cerrada_en IS NULL AND cerrada_por IS NULL AND resolucion IS NULL))`);
    await q.query(`CREATE TABLE pago (id_pago uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_liquidacion uuid NOT NULL REFERENCES liquidacion(id_liquidacion) ON DELETE RESTRICT, metodo varchar(16) NOT NULL CHECK(metodo='cash'), estado varchar(16) NOT NULL CHECK(estado='confirmed'), importe_ctvs bigint NOT NULL CHECK(importe_ctvs>0), recibido_ctvs bigint NOT NULL CHECK(recibido_ctvs>=importe_ctvs), cambio_ctvs bigint NOT NULL CHECK(cambio_ctvs=recibido_ctvs-importe_ctvs), registrado_usuario uuid NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT, creado_en timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE UNIQUE INDEX uq_pago_confirmado_liquidacion ON pago(id_liquidacion) WHERE estado='confirmed'`);
    await q.query(`CREATE TABLE historial_pago (id_historial_pago uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_pago uuid NOT NULL REFERENCES pago(id_pago) ON DELETE RESTRICT, actor_usuario uuid NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT, estado_anterior varchar(16), estado_nuevo varchar(16) NOT NULL, evento varchar(40) NOT NULL, ocurrido_en timestamptz NOT NULL DEFAULT now())`);
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES ('payments.collect','Cobrar liquidaciones'),('payments.read','Consultar pagos')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p WHERE r.codigo IN ('admin','worker') AND p.codigo IN ('payments.collect','payments.read')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pago) OR EXISTS (SELECT 1 FROM liquidacion WHERE estado='settled') THEN RAISE EXCEPTION 'No se puede revertir: existen pagos o liquidaciones cerradas'; END IF; END $$`);
    await q.query(`DELETE FROM rol_permiso WHERE id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo IN ('payments.collect','payments.read'))`);
    await q.query(`DELETE FROM permiso WHERE codigo IN ('payments.collect','payments.read')`);
    await q.query('DROP TABLE historial_pago, pago');
    await q.query(`ALTER TABLE liquidacion DROP CONSTRAINT liquidacion_check1, ADD CONSTRAINT liquidacion_check1 CHECK ((estado='pending' AND anulada_por IS NULL AND anulada_en IS NULL AND motivo_anulacion IS NULL) OR (estado='cancelled' AND anulada_por IS NOT NULL AND anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND length(trim(motivo_anulacion))>0))`);
    await q.query(`ALTER TABLE liquidacion DROP CONSTRAINT ck_liquidacion_resolucion, DROP COLUMN cerrada_en, DROP COLUMN cerrada_por, DROP COLUMN resolucion, DROP CONSTRAINT liquidacion_estado_check, ADD CONSTRAINT liquidacion_estado_check CHECK (estado IN ('pending','cancelled'))`);
  }
}
