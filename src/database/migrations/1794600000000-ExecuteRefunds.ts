import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExecuteRefunds1794600000000 implements MigrationInterface {
  name = 'ExecuteRefunds1794600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE devolucion DROP CONSTRAINT devolucion_estado_check,
      ADD CONSTRAINT devolucion_estado_check CHECK (estado IN ('pending','completed')),
      ADD COLUMN metodo varchar(16),
      ADD COLUMN ejecutada_por uuid REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      ADD COLUMN ejecutada_en timestamptz,
      ADD COLUMN referencia_bancaria varchar(120),
      ADD COLUMN destinatario varchar(160),
      ADD COLUMN observaciones varchar(500),
      ADD COLUMN id_caja uuid REFERENCES caja(id_caja) ON DELETE RESTRICT,
      ADD CONSTRAINT ck_devolucion_ejecucion CHECK (
        (estado='pending' AND metodo IS NULL AND ejecutada_por IS NULL AND ejecutada_en IS NULL AND referencia_bancaria IS NULL AND destinatario IS NULL AND observaciones IS NULL AND id_caja IS NULL)
        OR (estado='completed' AND metodo='transfer' AND ejecutada_por IS NOT NULL AND ejecutada_en IS NOT NULL AND referencia_bancaria IS NOT NULL AND length(trim(referencia_bancaria)) BETWEEN 1 AND 120 AND destinatario IS NULL AND id_caja IS NULL)
        OR (estado='completed' AND metodo='cash' AND ejecutada_por IS NOT NULL AND ejecutada_en IS NOT NULL AND destinatario IS NOT NULL AND length(trim(destinatario)) BETWEEN 1 AND 160 AND referencia_bancaria IS NULL AND id_caja IS NOT NULL)
      )`);
    await q.query(`CREATE UNIQUE INDEX uq_devolucion_referencia_bancaria ON devolucion(referencia_bancaria) WHERE referencia_bancaria IS NOT NULL`);
    await q.query(`CREATE TABLE historial_devolucion (
      id_historial uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_devolucion uuid NOT NULL REFERENCES devolucion(id_devolucion) ON DELETE RESTRICT,
      actor_usuario uuid NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      evento varchar(40) NOT NULL,
      ocurrido_en timestamptz NOT NULL DEFAULT now(),
      detalle jsonb NOT NULL DEFAULT '{}'::jsonb
    )`);
    await q.query(`CREATE TABLE salida_caja_devolucion (
      id_salida uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_devolucion uuid NOT NULL UNIQUE REFERENCES devolucion(id_devolucion) ON DELETE RESTRICT,
      id_caja uuid NOT NULL REFERENCES caja(id_caja) ON DELETE RESTRICT,
      importe_ctvs bigint NOT NULL CHECK (importe_ctvs>0 AND importe_ctvs<=9007199254740991),
      registrada_por uuid NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      registrada_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE FUNCTION proteger_devolucion_ejecutada() RETURNS trigger AS $$
      BEGIN
        IF OLD.estado='completed' THEN RAISE EXCEPTION 'Las devoluciones ejecutadas son inmutables.' USING ERRCODE='55000'; END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER tr_devolucion_ejecutada_inmutable BEFORE UPDATE OR DELETE ON devolucion FOR EACH ROW EXECUTE FUNCTION proteger_devolucion_ejecutada()`);
    await q.query(`CREATE FUNCTION proteger_historial_devolucion() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'El historial de devoluciones es inmutable.' USING ERRCODE='55000'; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER tr_historial_devolucion_inmutable BEFORE UPDATE OR DELETE ON historial_devolucion FOR EACH ROW EXECUTE FUNCTION proteger_historial_devolucion()`);
    await q.query(`CREATE TRIGGER tr_salida_devolucion_inmutable BEFORE UPDATE OR DELETE ON salida_caja_devolucion FOR EACH ROW EXECUTE FUNCTION proteger_historial_devolucion()`);
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES ('refunds.execute','Ejecutar devoluciones')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p WHERE r.codigo='admin' AND p.codigo='refunds.execute'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM devolucion WHERE estado='completed') OR EXISTS (SELECT 1 FROM salida_caja_devolucion) OR EXISTS (SELECT 1 FROM historial_devolucion) THEN
        RAISE EXCEPTION 'No se puede revertir: existen devoluciones ejecutadas o con historial';
      END IF;
    END $$`);
    await q.query(`DELETE FROM rol_permiso WHERE id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='refunds.execute')`);
    await q.query(`DELETE FROM permiso WHERE codigo='refunds.execute'`);
    await q.query(`DROP TRIGGER tr_devolucion_ejecutada_inmutable ON devolucion`);
    await q.query(`DROP TABLE salida_caja_devolucion, historial_devolucion`);
    await q.query(`DROP FUNCTION proteger_historial_devolucion()`);
    await q.query(`DROP FUNCTION proteger_devolucion_ejecutada()`);
    await q.query(`DROP INDEX uq_devolucion_referencia_bancaria`);
    await q.query(`ALTER TABLE devolucion DROP CONSTRAINT ck_devolucion_ejecucion, DROP CONSTRAINT devolucion_estado_check,
      DROP COLUMN metodo, DROP COLUMN ejecutada_por, DROP COLUMN ejecutada_en, DROP COLUMN referencia_bancaria,
      DROP COLUMN destinatario, DROP COLUMN observaciones, DROP COLUMN id_caja,
      ADD CONSTRAINT devolucion_estado_check CHECK (estado='pending')`);
  }
}
