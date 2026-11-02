import { MigrationInterface, QueryRunner } from 'typeorm';
export class DeliveryFulfillment1794400000000 implements MigrationInterface {
 name='DeliveryFulfillment1794400000000';
 async up(q:QueryRunner):Promise<void> {
 await q.query(`ALTER TABLE config_domicilio ADD COLUMN comprobante_plazo_seg integer NOT NULL DEFAULT 900 CHECK(comprobante_plazo_seg BETWEEN 60 AND 86400)`);
 await q.query(`ALTER TABLE entrega_domicilio ADD COLUMN comprobante_hasta timestamptz,ADD COLUMN despachado_en timestamptz,ADD COLUMN despachado_por uuid REFERENCES usuario(id_usuario),ADD COLUMN entregado_en timestamptz,ADD COLUMN entregado_por uuid REFERENCES usuario(id_usuario)`);
 await q.query(`ALTER TABLE pedido DROP CONSTRAINT pedido_estado_check,ADD CONSTRAINT pedido_estado_check CHECK(estado IN ('submitted','preparing','ready','dispatched','delivered','cancelled')),ADD CONSTRAINT ck_despacho_domicilio CHECK(estado<>'dispatched' OR modalidad='delivery')`);
 await q.query(`ALTER TABLE liquidacion DROP CONSTRAINT liquidacion_check1,ADD CONSTRAINT liquidacion_check1 CHECK((estado IN ('pending','settled') AND anulada_por IS NULL AND anulada_en IS NULL AND motivo_anulacion IS NULL) OR (estado='cancelled' AND anulada_en IS NOT NULL AND length(trim(motivo_anulacion))>0 AND (anulada_por IS NOT NULL OR motivo_anulacion='receiptDeadlineExpired')))`);
 }
 async down(q:QueryRunner):Promise<void> {
 await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM entrega_domicilio WHERE comprobante_hasta IS NOT NULL OR despachado_en IS NOT NULL OR entregado_en IS NOT NULL) OR EXISTS(SELECT 1 FROM pedido WHERE estado='dispatched') OR EXISTS(SELECT 1 FROM liquidacion WHERE estado='cancelled' AND anulada_por IS NULL) OR EXISTS(SELECT 1 FROM config_domicilio WHERE comprobante_plazo_seg<>900) THEN RAISE EXCEPTION 'No se puede revertir: existen datos de etapa 8C'; END IF; END $$`);
 await q.query(`ALTER TABLE liquidacion DROP CONSTRAINT liquidacion_check1,ADD CONSTRAINT liquidacion_check1 CHECK((estado IN ('pending','settled') AND anulada_por IS NULL AND anulada_en IS NULL AND motivo_anulacion IS NULL) OR (estado='cancelled' AND anulada_por IS NOT NULL AND anulada_en IS NOT NULL AND length(trim(motivo_anulacion))>0))`);
 await q.query(`ALTER TABLE pedido DROP CONSTRAINT ck_despacho_domicilio,DROP CONSTRAINT pedido_estado_check,ADD CONSTRAINT pedido_estado_check CHECK(estado IN ('submitted','preparing','ready','delivered','cancelled'))`);
 await q.query(`ALTER TABLE entrega_domicilio DROP COLUMN comprobante_hasta,DROP COLUMN despachado_en,DROP COLUMN despachado_por,DROP COLUMN entregado_en,DROP COLUMN entregado_por`);
 await q.query(`ALTER TABLE config_domicilio DROP COLUMN comprobante_plazo_seg`);
 }
}
