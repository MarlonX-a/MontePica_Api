import { MigrationInterface, QueryRunner } from 'typeorm';

export class OperatingDayClosures1795000000000 implements MigrationInterface {
  name = 'OperatingDayClosures1795000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE cierre_jornada (
      id_cierre uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_jornada uuid NOT NULL UNIQUE REFERENCES jornada_operativa(id_jornada) ON DELETE RESTRICT,
      id_cierre_caja uuid UNIQUE REFERENCES cierre_caja(id_cierre) ON DELETE RESTRICT,
      cerrado_por uuid NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      cerrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
      observaciones varchar(500),
      resumen jsonb NOT NULL CHECK(jsonb_typeof(resumen)='object')
    )`);
    await q.query(`CREATE TABLE apertura_excepcional_jornada (
      id_apertura_excepcional uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_jornada uuid NOT NULL UNIQUE REFERENCES jornada_operativa(id_jornada) ON DELETE RESTRICT,
      abierta_por uuid NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      abierta_en timestamptz NOT NULL DEFAULT clock_timestamp(),
      motivo varchar(500) NOT NULL CHECK(length(trim(motivo)) BETWEEN 1 AND 500),
      jornadas_pendientes uuid[] NOT NULL CHECK(cardinality(jornadas_pendientes)>0)
    )`);
    await q.query(
      `CREATE FUNCTION proteger_registro_cierre_jornada() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'El registro operativo es inmutable.' USING ERRCODE='55000'; END; $$ LANGUAGE plpgsql`,
    );
    await q.query(
      `CREATE TRIGGER tr_cierre_jornada_inmutable BEFORE UPDATE OR DELETE ON cierre_jornada FOR EACH ROW EXECUTE FUNCTION proteger_registro_cierre_jornada()`,
    );
    await q.query(
      `CREATE TRIGGER tr_apertura_excepcional_inmutable BEFORE UPDATE OR DELETE ON apertura_excepcional_jornada FOR EACH ROW EXECUTE FUNCTION proteger_registro_cierre_jornada()`,
    );
    await q.query(`CREATE FUNCTION proteger_estado_jornada() RETURNS trigger AS $$ BEGIN
      IF OLD.estado='closed' AND NEW.estado<>'closed' THEN RAISE EXCEPTION 'Una jornada cerrada no puede reabrirse.' USING ERRCODE='55000'; END IF;
      IF OLD.estado='open' AND NEW.estado='closed' AND NOT EXISTS(SELECT 1 FROM cierre_jornada WHERE id_jornada=OLD.id_jornada) THEN RAISE EXCEPTION 'La jornada requiere un registro de cierre.' USING ERRCODE='55000'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await q.query(
      `CREATE TRIGGER tr_jornada_cierre_inmutable BEFORE UPDATE OF estado ON jornada_operativa FOR EACH ROW EXECUTE FUNCTION proteger_estado_jornada()`,
    );
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES
      ('operations.closeDay','Cerrar jornadas operativas'),
      ('operations.openWithPendingDays','Abrir una jornada con jornadas previas pendientes')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso)
      SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p
      WHERE r.codigo='admin' AND p.codigo IN ('operations.closeDay','operations.openWithPendingDays')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM cierre_jornada) OR EXISTS(SELECT 1 FROM apertura_excepcional_jornada) THEN
        RAISE EXCEPTION 'No se puede revertir: existen cierres o aperturas excepcionales de jornada';
      END IF;
    END $$`);
    await q.query(
      `DELETE FROM rol_permiso WHERE id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo IN ('operations.closeDay','operations.openWithPendingDays'))`,
    );
    await q.query(
      `DELETE FROM permiso WHERE codigo IN ('operations.closeDay','operations.openWithPendingDays')`,
    );
    await q.query(
      `DROP TRIGGER tr_jornada_cierre_inmutable ON jornada_operativa`,
    );
    await q.query(`DROP FUNCTION proteger_estado_jornada()`);
    await q.query(
      `DROP TRIGGER tr_apertura_excepcional_inmutable ON apertura_excepcional_jornada`,
    );
    await q.query(`DROP TRIGGER tr_cierre_jornada_inmutable ON cierre_jornada`);
    await q.query(`DROP FUNCTION proteger_registro_cierre_jornada()`);
    await q.query(`DROP TABLE apertura_excepcional_jornada,cierre_jornada`);
  }
}
