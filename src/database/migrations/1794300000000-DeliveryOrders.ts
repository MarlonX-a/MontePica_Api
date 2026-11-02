import { MigrationInterface, QueryRunner } from 'typeorm';
export class DeliveryOrders1794300000000 implements MigrationInterface {
 name='DeliveryOrders1794300000000';
 async up(q:QueryRunner):Promise<void> {
  await q.query(`ALTER TABLE cuenta_consumo ALTER COLUMN id_participante DROP NOT NULL, DROP CONSTRAINT ck_cuenta_modalidad, ADD CONSTRAINT ck_cuenta_modalidad CHECK ((modalidad='local' AND id_participante IS NOT NULL) OR (modalidad='delivery' AND id_participante IS NULL))`);
  await q.query(`ALTER TABLE pedido ALTER COLUMN id_visita DROP NOT NULL, DROP CONSTRAINT pedido_modalidad_check, ADD CONSTRAINT pedido_modalidad_check CHECK ((modalidad='local' AND id_visita IS NOT NULL) OR (modalidad='delivery' AND id_visita IS NULL))`);
  await q.query(`ALTER TABLE liquidacion DROP CONSTRAINT liquidacion_envio_ctvs_check, ADD CONSTRAINT liquidacion_envio_ctvs_check CHECK (envio_ctvs>=0)`);
  await q.query(`CREATE TABLE entrega_domicilio (id_pedido uuid PRIMARY KEY REFERENCES pedido(id_pedido), id_solicitud uuid NOT NULL UNIQUE REFERENCES solicitud_domicilio(id_solicitud), destinatario varchar(160) NOT NULL,telefono varchar(20) NOT NULL,direccion varchar(500) NOT NULL,referencias varchar(500),latitud double precision,longitud double precision,version_configuracion integer NOT NULL,tarifa_ctvs bigint NOT NULL CHECK(tarifa_ctvs BETWEEN 0 AND 9007199254740991))`);
 }
 async down(q:QueryRunner):Promise<void> {
  await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM entrega_domicilio) OR EXISTS(SELECT 1 FROM cuenta_consumo WHERE modalidad='delivery') OR EXISTS(SELECT 1 FROM pedido WHERE modalidad='delivery') OR EXISTS(SELECT 1 FROM liquidacion WHERE envio_ctvs<>0) THEN RAISE EXCEPTION 'No se puede revertir: existen domicilios'; END IF; END $$`);
  await q.query(`DROP TABLE entrega_domicilio`);
  await q.query(`ALTER TABLE liquidacion DROP CONSTRAINT liquidacion_envio_ctvs_check, ADD CONSTRAINT liquidacion_envio_ctvs_check CHECK(envio_ctvs=0)`);
  await q.query(`ALTER TABLE pedido DROP CONSTRAINT pedido_modalidad_check, ADD CONSTRAINT pedido_modalidad_check CHECK(modalidad='local'), ALTER COLUMN id_visita SET NOT NULL`);
  await q.query(`ALTER TABLE cuenta_consumo DROP CONSTRAINT ck_cuenta_modalidad, ADD CONSTRAINT ck_cuenta_modalidad CHECK(modalidad='local'), ALTER COLUMN id_participante SET NOT NULL`);
 }
}
