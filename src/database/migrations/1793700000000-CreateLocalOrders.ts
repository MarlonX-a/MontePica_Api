import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLocalOrders1793700000000 implements MigrationInterface {
  name = 'CreateLocalOrders1793700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE pedido (
      id_pedido uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_jornada uuid NOT NULL REFERENCES jornada_operativa(id_jornada),
      id_visita uuid NOT NULL REFERENCES visita_mesa(id_visita), id_cuenta uuid NOT NULL REFERENCES cuenta_consumo(id_cuenta),
      actor_usuario uuid REFERENCES usuario(id_usuario), actor_sesion_cliente uuid REFERENCES sesion_cliente(id_sesion_cliente),
      modalidad varchar(16) NOT NULL DEFAULT 'local' CHECK (modalidad='local'), origen varchar(16) NOT NULL DEFAULT 'client' CHECK (origen='client'),
      estado varchar(20) NOT NULL DEFAULT 'submitted' CHECK (estado='submitted'), enviado_en timestamptz NOT NULL DEFAULT now(), editable_hasta timestamptz,
      CHECK (num_nonnulls(actor_usuario, actor_sesion_cliente)=1))`);
    await q.query(`CREATE TABLE version_pedido (
      id_version uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_pedido uuid NOT NULL REFERENCES pedido(id_pedido), numero integer NOT NULL CHECK (numero>0),
      estado varchar(20) NOT NULL CHECK (estado IN ('current','superseded')), total_productos_ctvs bigint NOT NULL CHECK (total_productos_ctvs>=0),
      observaciones varchar(500), creada_en timestamptz NOT NULL DEFAULT now(), UNIQUE(id_pedido, numero))`);
    await q.query(`CREATE UNIQUE INDEX uq_version_pedido_vigente ON version_pedido(id_pedido) WHERE estado='current'`);
    await q.query(`CREATE TABLE detalle_pedido (
      id_detalle uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_version uuid NOT NULL REFERENCES version_pedido(id_version),
      id_producto uuid NOT NULL REFERENCES producto(id_producto), cantidad integer NOT NULL CHECK (cantidad BETWEEN 1 AND 999),
      precio_unitario_ctvs integer NOT NULL CHECK (precio_unitario_ctvs>=0), controla_stock_snapshot boolean NOT NULL,
      observaciones varchar(500), UNIQUE(id_version,id_producto))`);
    await q.query(`CREATE TABLE asignacion_consumo (
      id_asignacion uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_detalle uuid NOT NULL REFERENCES detalle_pedido(id_detalle),
      id_cuenta uuid NOT NULL REFERENCES cuenta_consumo(id_cuenta), cantidad integer NOT NULL CHECK (cantidad>0),
      estado varchar(20) NOT NULL DEFAULT 'active' CHECK (estado IN ('active','superseded')), creada_en timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id_detalle,id_cuenta))`);
    await q.query(`CREATE TABLE reserva_inventario (
      id_reserva uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_detalle uuid NOT NULL UNIQUE REFERENCES detalle_pedido(id_detalle),
      id_inventario uuid NOT NULL REFERENCES inventario_diario(id_inventario), cantidad integer NOT NULL CHECK (cantidad>0),
      estado varchar(20) NOT NULL DEFAULT 'active' CHECK (estado='active'), creada_en timestamptz NOT NULL DEFAULT now(), resuelta_en timestamptz)`);
    await q.query(`CREATE TABLE historial_pedido (
      id_historial uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_pedido uuid NOT NULL REFERENCES pedido(id_pedido),
      id_version uuid REFERENCES version_pedido(id_version), actor_usuario uuid REFERENCES usuario(id_usuario),
      actor_sesion_cliente uuid REFERENCES sesion_cliente(id_sesion_cliente), actor_tipo varchar(20) NOT NULL,
      evento varchar(40) NOT NULL, estado_anterior varchar(20), estado_nuevo varchar(20) NOT NULL, ocurrido_en timestamptz NOT NULL DEFAULT now())`);
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES ('orders.read','Consultar pedidos')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p WHERE r.codigo IN ('admin','worker') AND p.codigo='orders.read'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pedido) THEN RAISE EXCEPTION 'No se puede revertir: existen pedidos'; END IF; END $$`);
    await q.query(`DELETE FROM rol_permiso WHERE id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='orders.read')`);
    await q.query(`DELETE FROM permiso WHERE codigo='orders.read'`);
    await q.query('DROP TABLE historial_pedido, reserva_inventario, asignacion_consumo, detalle_pedido, version_pedido, pedido');
  }
}
