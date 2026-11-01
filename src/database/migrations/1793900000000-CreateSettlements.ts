import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSettlements1793900000000 implements MigrationInterface {
  name = 'CreateSettlements1793900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE liquidacion (
      id_liquidacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_cuenta uuid NOT NULL REFERENCES cuenta_consumo(id_cuenta) ON DELETE RESTRICT,
      id_caja uuid NOT NULL REFERENCES caja(id_caja) ON DELETE RESTRICT,
      estado varchar(16) NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending','cancelled')),
      productos_ctvs bigint NOT NULL CHECK (productos_ctvs>=0), envio_ctvs bigint NOT NULL DEFAULT 0 CHECK (envio_ctvs=0),
      total_ctvs bigint NOT NULL CHECK (total_ctvs=productos_ctvs+envio_ctvs),
      creada_por uuid NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      creada_en timestamptz NOT NULL DEFAULT now(), anulada_por uuid REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
      anulada_en timestamptz, motivo_anulacion varchar(500),
      CHECK ((estado='pending' AND anulada_por IS NULL AND anulada_en IS NULL AND motivo_anulacion IS NULL) OR
             (estado='cancelled' AND anulada_por IS NOT NULL AND anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND length(trim(motivo_anulacion))>0)))`);
    await q.query(`CREATE UNIQUE INDEX uq_liquidacion_pendiente_cuenta ON liquidacion(id_cuenta) WHERE estado='pending'`);
    await q.query(`CREATE TABLE detalle_liquidacion (
      id_detalle_liquidacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_liquidacion uuid NOT NULL REFERENCES liquidacion(id_liquidacion) ON DELETE RESTRICT,
      id_asignacion uuid NOT NULL REFERENCES asignacion_consumo(id_asignacion) ON DELETE RESTRICT,
      cantidad_snapshot integer NOT NULL CHECK (cantidad_snapshot>0), precio_snapshot_ctvs integer NOT NULL CHECK (precio_snapshot_ctvs>=0),
      importe_ctvs bigint NOT NULL CHECK (importe_ctvs=cantidad_snapshot::bigint*precio_snapshot_ctvs),
      vigente boolean NOT NULL DEFAULT true, UNIQUE(id_liquidacion,id_asignacion))`);
    await q.query(`CREATE UNIQUE INDEX uq_detalle_liquidacion_asignacion_vigente ON detalle_liquidacion(id_asignacion) WHERE vigente`);
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES ('accounts.read','Consultar cuentas'),('settlements.read','Consultar liquidaciones'),('settlements.manage','Gestionar liquidaciones')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p WHERE r.codigo IN ('admin','worker') AND p.codigo IN ('accounts.read','settlements.read','settlements.manage')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM liquidacion) THEN RAISE EXCEPTION 'No se puede revertir: existen liquidaciones'; END IF; END $$`);
    await q.query(`DELETE FROM rol_permiso WHERE id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo IN ('accounts.read','settlements.read','settlements.manage'))`);
    await q.query(`DELETE FROM permiso WHERE codigo IN ('accounts.read','settlements.read','settlements.manage')`);
    await q.query(`DROP TABLE detalle_liquidacion, liquidacion`);
  }
}
