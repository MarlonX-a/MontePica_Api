import { MigrationInterface, QueryRunner } from 'typeorm';

export class CancellationRequests1794500000000 implements MigrationInterface {
  name = 'CancellationRequests1794500000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE solicitud_cancelacion (
      id_solicitud uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_pedido uuid NOT NULL REFERENCES pedido(id_pedido),
      id_version uuid NOT NULL REFERENCES version_pedido(id_version),
      estado_pedido varchar(20) NOT NULL,
      solicitada_cliente boolean NOT NULL DEFAULT false,
      estado varchar(20) NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending','approved','rejected','withdrawn')),
      motivo varchar(500) NOT NULL CHECK (length(trim(motivo)) BETWEEN 1 AND 500),
      actor_usuario uuid REFERENCES usuario(id_usuario),
      actor_sesion_cliente uuid REFERENCES sesion_cliente(id_sesion_cliente),
      creada_en timestamptz NOT NULL DEFAULT now(),
      decidida_por uuid REFERENCES usuario(id_usuario),
      decidida_en timestamptz,
      motivo_rechazo varchar(500),
      CHECK (num_nonnulls(actor_usuario,actor_sesion_cliente)=1)
    )`);
    await q.query(
      `CREATE UNIQUE INDEX uq_cancelacion_pendiente_pedido ON solicitud_cancelacion(id_pedido) WHERE estado='pending'`,
    );
    await q.query(`CREATE TABLE historial_cancelacion (
      id_historial uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_solicitud uuid NOT NULL REFERENCES solicitud_cancelacion(id_solicitud),
      actor_usuario uuid REFERENCES usuario(id_usuario),
      actor_sesion_cliente uuid REFERENCES sesion_cliente(id_sesion_cliente),
      evento varchar(40) NOT NULL,
      ocurrido_en timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(actor_usuario,actor_sesion_cliente)=1)
    )`);
    await q.query(`CREATE TABLE devolucion (
      id_devolucion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_solicitud uuid NOT NULL UNIQUE REFERENCES solicitud_cancelacion(id_solicitud),
      id_pago uuid NOT NULL UNIQUE REFERENCES pago(id_pago),
      id_pedido uuid NOT NULL UNIQUE REFERENCES pedido(id_pedido),
      importe_ctvs bigint NOT NULL CHECK (importe_ctvs>0 AND importe_ctvs<=9007199254740991),
      estado varchar(20) NOT NULL DEFAULT 'pending' CHECK (estado='pending'),
      autorizada_por uuid NOT NULL REFERENCES usuario(id_usuario),
      creada_en timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES
      ('cancellations.create','Registrar solicitudes de cancelacion'),
      ('cancellations.read','Consultar solicitudes de cancelacion'),
      ('cancellations.decide','Decidir solicitudes de cancelacion'),
      ('refunds.read','Consultar devoluciones')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso)
      SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p
      WHERE (r.codigo='admin' AND p.codigo IN ('cancellations.create','cancellations.read','cancellations.decide','refunds.read'))
      OR (r.codigo='worker' AND p.codigo IN ('cancellations.create','cancellations.read','refunds.read'))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM solicitud_cancelacion) OR EXISTS (SELECT 1 FROM devolucion) THEN RAISE EXCEPTION 'No se puede revertir: existen cancelaciones o devoluciones'; END IF; END $$`,
    );
    await q.query(
      `DELETE FROM rol_permiso WHERE id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo IN ('cancellations.create','cancellations.read','cancellations.decide','refunds.read'))`,
    );
    await q.query(
      `DELETE FROM permiso WHERE codigo IN ('cancellations.create','cancellations.read','cancellations.decide','refunds.read')`,
    );
    await q.query(
      `DROP TABLE devolucion, historial_cancelacion, solicitud_cancelacion`,
    );
  }
}
