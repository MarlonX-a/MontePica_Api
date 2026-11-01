import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderLifecycle1793800000000 implements MigrationInterface {
  name = 'OrderLifecycle1793800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE configuracion_operativa ADD COLUMN edicion_local_seg integer NOT NULL DEFAULT 300 CHECK (edicion_local_seg BETWEEN 0 AND 3600)`);
    await q.query(`ALTER TABLE pedido DROP CONSTRAINT pedido_estado_check, ADD CONSTRAINT pedido_estado_check CHECK (estado IN ('submitted','preparing','ready','delivered','cancelled'))`);
    await q.query(`ALTER TABLE reserva_inventario DROP CONSTRAINT reserva_inventario_estado_check, ADD CONSTRAINT reserva_inventario_estado_check CHECK (estado IN ('active','released','consumed'))`);
    await q.query(`ALTER TABLE movimiento_inventario DROP CONSTRAINT ck_movimiento_inventario_tipo, ADD CONSTRAINT ck_movimiento_inventario_tipo CHECK (tipo IN ('initialization','restock','internalConsumption','giveaway','waste','adjustment','orderConsumption')), ADD COLUMN id_reserva uuid UNIQUE REFERENCES reserva_inventario(id_reserva)`);
    await q.query(`ALTER TABLE historial_pedido ADD COLUMN motivo varchar(500)`);
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES ('orders.manage','Gestionar pedidos')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p WHERE r.codigo IN ('admin','worker') AND p.codigo='orders.manage'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM configuracion_operativa WHERE edicion_local_seg<>300) OR EXISTS (SELECT 1 FROM pedido WHERE estado<>'submitted' OR editable_hasta IS NOT NULL) OR EXISTS (SELECT 1 FROM reserva_inventario WHERE estado<>'active') OR EXISTS (SELECT 1 FROM movimiento_inventario WHERE id_reserva IS NOT NULL OR tipo='orderConsumption') OR EXISTS (SELECT 1 FROM version_pedido WHERE numero<>1) OR EXISTS (SELECT 1 FROM historial_pedido WHERE motivo IS NOT NULL) THEN RAISE EXCEPTION 'No se puede revertir: existen datos de la etapa 6B'; END IF; END $$`);
    await q.query(`DELETE FROM rol_permiso WHERE id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='orders.manage')`);
    await q.query(`DELETE FROM permiso WHERE codigo='orders.manage'`);
    await q.query(`ALTER TABLE historial_pedido DROP COLUMN motivo`);
    await q.query(`ALTER TABLE movimiento_inventario DROP COLUMN id_reserva, DROP CONSTRAINT ck_movimiento_inventario_tipo, ADD CONSTRAINT ck_movimiento_inventario_tipo CHECK (tipo IN ('initialization','restock','internalConsumption','giveaway','waste','adjustment'))`);
    await q.query(`ALTER TABLE reserva_inventario DROP CONSTRAINT reserva_inventario_estado_check, ADD CONSTRAINT reserva_inventario_estado_check CHECK (estado='active')`);
    await q.query(`ALTER TABLE pedido DROP CONSTRAINT pedido_estado_check, ADD CONSTRAINT pedido_estado_check CHECK (estado='submitted')`);
    await q.query(`ALTER TABLE configuracion_operativa DROP COLUMN edicion_local_seg`);
  }
}
