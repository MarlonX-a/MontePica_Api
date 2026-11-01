import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeliveryCoverage1794200000000 implements MigrationInterface {
  name = 'CreateDeliveryCoverage1794200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE config_domicilio (
      id_configuracion uuid PRIMARY KEY DEFAULT gen_random_uuid(), version integer NOT NULL UNIQUE CHECK(version>0),
      habilitado boolean NOT NULL DEFAULT false, cobertura varchar(500) NOT NULL, tarifa_ctvs bigint NOT NULL CHECK(tarifa_ctvs BETWEEN 0 AND 9007199254740991),
      configurada_por uuid REFERENCES usuario(id_usuario) ON DELETE RESTRICT, creada_en timestamptz NOT NULL DEFAULT now())`);
    await q.query(`INSERT INTO config_domicilio(version,habilitado,cobertura,tarifa_ctvs) VALUES (1,false,'',0)`);
    await q.query(`CREATE FUNCTION rechazar_cambio_config_domicilio() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'La configuración de domicilio es inmutable.' USING ERRCODE='55000'; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER tr_config_domicilio_inmutable BEFORE UPDATE OR DELETE ON config_domicilio FOR EACH ROW EXECUTE FUNCTION rechazar_cambio_config_domicilio()`);
    await q.query(`CREATE TABLE solicitud_domicilio (
      id_solicitud uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_cliente uuid NOT NULL REFERENCES cliente(id_cliente) ON DELETE RESTRICT,
      id_jornada uuid NOT NULL REFERENCES jornada_operativa(id_jornada) ON DELETE RESTRICT, id_configuracion uuid NOT NULL REFERENCES config_domicilio(id_configuracion) ON DELETE RESTRICT,
      destinatario varchar(160) NOT NULL CHECK(length(trim(destinatario))>0), telefono varchar(20) NOT NULL CHECK(length(trim(telefono))>0),
      direccion varchar(500) NOT NULL CHECK(length(trim(direccion))>0), referencias varchar(500), latitud double precision, longitud double precision,
      tarifa_ctvs bigint NOT NULL CHECK(tarifa_ctvs BETWEEN 0 AND 9007199254740991), estado varchar(16) NOT NULL DEFAULT 'pending' CHECK(estado IN ('pending','approved','rejected','cancelled')),
      creada_en timestamptz NOT NULL DEFAULT now(), decidida_en timestamptz, decidida_por uuid REFERENCES usuario(id_usuario) ON DELETE RESTRICT, motivo_rechazo varchar(500), cancelada_en timestamptz,
      CHECK ((latitud IS NULL AND longitud IS NULL) OR (latitud IS NOT NULL AND longitud IS NOT NULL AND latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180)))`);
    await q.query(`CREATE INDEX ix_solicitud_domicilio_cliente_fecha ON solicitud_domicilio(id_cliente,creada_en DESC,id_solicitud DESC)`);
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES ('delivery.read','Consultar domicilios'),('delivery.configure','Configurar domicilios'),('delivery.review','Revisar cobertura')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p WHERE (r.codigo='admin' AND p.codigo IN ('delivery.read','delivery.configure','delivery.review')) OR (r.codigo='worker' AND p.codigo IN ('delivery.read','delivery.review'))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM solicitud_domicilio) OR EXISTS (SELECT 1 FROM config_domicilio WHERE version>1) THEN RAISE EXCEPTION 'No se puede revertir: existen solicitudes o configuración de domicilios'; END IF; END $$`);
    await q.query(`DELETE FROM rol_permiso WHERE id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo IN ('delivery.read','delivery.configure','delivery.review'))`);
    await q.query(`DELETE FROM permiso WHERE codigo IN ('delivery.read','delivery.configure','delivery.review')`);
    await q.query('DROP TABLE solicitud_domicilio');
    await q.query('DROP TABLE config_domicilio');
    await q.query('DROP FUNCTION rechazar_cambio_config_domicilio()');
  }
}
