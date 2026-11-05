import { MigrationInterface, QueryRunner } from 'typeorm';
export class PointsProgram1794700000000 implements MigrationInterface {
  name = 'PointsProgram1794700000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE configuracion_puntos(id_configuracion uuid PRIMARY KEY DEFAULT gen_random_uuid(),version integer NOT NULL UNIQUE CHECK(version>0),habilitado boolean NOT NULL,tasa_por_dolar integer NOT NULL CHECK(tasa_por_dolar BETWEEN 1 AND 1000),configurada_por uuid REFERENCES usuario(id_usuario),creada_en timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `INSERT INTO configuracion_puntos(version,habilitado,tasa_por_dolar) VALUES(1,false,1)`,
    );
    await q.query(
      `CREATE TABLE acumulacion_puntos(id_acumulacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_pago uuid NOT NULL UNIQUE REFERENCES pago(id_pago),id_cliente uuid NOT NULL REFERENCES cliente(id_cliente),id_configuracion uuid NOT NULL REFERENCES configuracion_puntos(id_configuracion),productos_ctvs bigint NOT NULL CHECK(productos_ctvs>=0),puntos bigint NOT NULL CHECK(puntos BETWEEN 0 AND 9007199254740991),estado varchar(16) NOT NULL CHECK(estado IN ('pending','credited','cancelled')),creada_en timestamptz NOT NULL DEFAULT now(),acreditada_en timestamptz)`,
    );
    await q.query(
      `CREATE TABLE movimiento_puntos(id_movimiento uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_cliente uuid NOT NULL REFERENCES cliente(id_cliente),id_acumulacion uuid NOT NULL REFERENCES acumulacion_puntos(id_acumulacion),id_devolucion uuid UNIQUE REFERENCES devolucion(id_devolucion),tipo varchar(24) NOT NULL CHECK(tipo IN ('earn','refundAdjustment')),puntos bigint NOT NULL CHECK(puntos<>0 AND puntos BETWEEN -9007199254740991 AND 9007199254740991),creado_en timestamptz NOT NULL DEFAULT now(),CHECK((tipo='earn' AND puntos>0 AND id_devolucion IS NULL) OR (tipo='refundAdjustment' AND puntos<0 AND id_devolucion IS NOT NULL)))`,
    );
    await q.query(
      `INSERT INTO permiso(codigo,descripcion) VALUES('points.read','Consultar puntos'),('points.configure','Configurar puntos')`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_puntos_acreditacion ON movimiento_puntos(id_acumulacion) WHERE tipo='earn'`,
    );
    await q.query(
      `CREATE FUNCTION puntos_inmutables() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'La configuracion y los movimientos de puntos son inmutables' USING ERRCODE='55000'; END; $$ LANGUAGE plpgsql`,
    );
    await q.query(
      `CREATE TRIGGER tr_configuracion_puntos_inmutable BEFORE UPDATE OR DELETE ON configuracion_puntos FOR EACH ROW EXECUTE FUNCTION puntos_inmutables()`,
    );
    await q.query(
      `CREATE TRIGGER tr_movimiento_puntos_inmutable BEFORE UPDATE OR DELETE ON movimiento_puntos FOR EACH ROW EXECUTE FUNCTION puntos_inmutables()`,
    );
    await q.query(
      `INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p WHERE (r.codigo='admin' AND p.codigo IN('points.read','points.configure')) OR (r.codigo='worker' AND p.codigo='points.read')`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DO $$ BEGIN IF (SELECT count(*) FROM configuracion_puntos)>1 OR EXISTS(SELECT 1 FROM acumulacion_puntos) OR EXISTS(SELECT 1 FROM movimiento_puntos) THEN RAISE EXCEPTION 'No se puede revertir: existen configuraciones o movimientos de puntos'; END IF; END $$`,
    );
    await q.query(
      `DELETE FROM rol_permiso WHERE id_permiso IN(SELECT id_permiso FROM permiso WHERE codigo IN('points.read','points.configure'))`,
    );
    await q.query(
      `DELETE FROM permiso WHERE codigo IN('points.read','points.configure')`,
    );
    await q.query(
      `DROP TABLE movimiento_puntos,acumulacion_puntos,configuracion_puntos`,
    );
    await q.query(`DROP FUNCTION puntos_inmutables()`);
  }
}
