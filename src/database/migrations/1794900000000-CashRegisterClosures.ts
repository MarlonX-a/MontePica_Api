import { MigrationInterface, QueryRunner } from 'typeorm';

export class CashRegisterClosures1794900000000 implements MigrationInterface {
  name = 'CashRegisterClosures1794900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE cierre_caja (
      id_cierre uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_caja uuid NOT NULL UNIQUE REFERENCES caja(id_caja) ON DELETE RESTRICT,
      cerrado_por uuid NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      cerrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
      fondo_inicial_ctvs bigint NOT NULL CHECK(fondo_inicial_ctvs BETWEEN 0 AND 9007199254740991),
      ingresos_efectivo_ctvs bigint NOT NULL CHECK(ingresos_efectivo_ctvs BETWEEN 0 AND 9007199254740991),
      devoluciones_efectivo_ctvs bigint NOT NULL CHECK(devoluciones_efectivo_ctvs BETWEEN 0 AND 9007199254740991),
      esperado_ctvs bigint NOT NULL CHECK(esperado_ctvs BETWEEN -9007199254740991 AND 9007199254740991),
      contado_ctvs bigint NOT NULL CHECK(contado_ctvs BETWEEN 0 AND 9007199254740991),
      diferencia_ctvs bigint NOT NULL CHECK(diferencia_ctvs BETWEEN -9007199254740991 AND 9007199254740991),
      justificacion varchar(500),
      CONSTRAINT ck_cierre_caja_calculo CHECK(esperado_ctvs=fondo_inicial_ctvs+ingresos_efectivo_ctvs-devoluciones_efectivo_ctvs AND diferencia_ctvs=contado_ctvs-esperado_ctvs),
      CONSTRAINT ck_cierre_caja_justificacion CHECK((diferencia_ctvs=0) OR (justificacion IS NOT NULL AND length(trim(justificacion)) BETWEEN 1 AND 500))
    )`);
    await q.query(
      `CREATE FUNCTION proteger_cierre_caja() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'El cierre de caja es inmutable.' USING ERRCODE='55000'; END; $$ LANGUAGE plpgsql`,
    );
    await q.query(
      `CREATE TRIGGER tr_cierre_caja_inmutable BEFORE UPDATE OR DELETE ON cierre_caja FOR EACH ROW EXECUTE FUNCTION proteger_cierre_caja()`,
    );
    await q.query(
      `CREATE FUNCTION proteger_caja_cerrada() RETURNS trigger AS $$ BEGIN IF OLD.estado='closed' AND EXISTS(SELECT 1 FROM cierre_caja WHERE id_caja=OLD.id_caja) THEN RAISE EXCEPTION 'Una caja conciliada no puede modificarse ni reabrirse.' USING ERRCODE='55000'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
    );
    await q.query(
      `CREATE TRIGGER tr_caja_cerrada_inmutable BEFORE UPDATE ON caja FOR EACH ROW EXECUTE FUNCTION proteger_caja_cerrada()`,
    );
    await q.query(
      `INSERT INTO permiso(codigo,descripcion) VALUES ('operations.closeCash','Conciliar y cerrar caja')`,
    );
    await q.query(
      `INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p WHERE r.codigo='admin' AND p.codigo='operations.closeCash'`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DO $$ BEGIN IF EXISTS(SELECT 1 FROM cierre_caja) THEN RAISE EXCEPTION 'No se puede revertir: existen cierres de caja'; END IF; END $$`,
    );
    await q.query(
      `DELETE FROM rol_permiso WHERE id_permiso IN(SELECT id_permiso FROM permiso WHERE codigo='operations.closeCash')`,
    );
    await q.query(`DELETE FROM permiso WHERE codigo='operations.closeCash'`);
    await q.query(
      `DROP TRIGGER tr_caja_cerrada_inmutable ON caja; DROP FUNCTION proteger_caja_cerrada()`,
    );
    await q.query(
      `DROP TRIGGER tr_cierre_caja_inmutable ON cierre_caja; DROP TABLE cierre_caja; DROP FUNCTION proteger_cierre_caja()`,
    );
  }
}
