import { MigrationInterface, QueryRunner } from 'typeorm';

export class LocalRewards1794800000000 implements MigrationInterface {
  name = 'LocalRewards1794800000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE recompensa (
      id_recompensa uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre varchar(160) NOT NULL,
      descripcion varchar(500), id_producto uuid NOT NULL REFERENCES producto(id_producto) ON DELETE RESTRICT,
      costo_puntos bigint NOT NULL CHECK(costo_puntos BETWEEN 1 AND 9007199254740991),
      activa boolean NOT NULL DEFAULT true, orden integer NOT NULL DEFAULT 0 CHECK(orden>=0),
      version integer NOT NULL DEFAULT 1 CHECK(version>0), creada_en timestamptz NOT NULL DEFAULT now(),
      actualizada_en timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX ix_recompensa_publica ON recompensa(activa,orden,nombre,id_recompensa)`);
    await q.query(`CREATE TABLE solicitud_canje (
      id_canje uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_cliente uuid NOT NULL REFERENCES cliente(id_cliente),
      id_participante uuid NOT NULL REFERENCES participante(id_participante), id_cuenta uuid NOT NULL REFERENCES cuenta_consumo(id_cuenta),
      id_visita uuid NOT NULL REFERENCES visita_mesa(id_visita), id_jornada uuid NOT NULL REFERENCES jornada_operativa(id_jornada),
      id_recompensa uuid NOT NULL REFERENCES recompensa(id_recompensa), version_recompensa integer NOT NULL CHECK(version_recompensa>0),
      id_producto uuid NOT NULL REFERENCES producto(id_producto), controla_stock boolean NOT NULL, costo_puntos bigint NOT NULL CHECK(costo_puntos BETWEEN 1 AND 9007199254740991),
      estado varchar(16) NOT NULL DEFAULT 'pending' CHECK(estado IN ('pending','approved','rejected','cancelled','expired')),
      expira_en timestamptz NOT NULL, creada_en timestamptz NOT NULL DEFAULT now(), resuelta_en timestamptz,
      creado_por uuid REFERENCES usuario(id_usuario), resuelto_por uuid REFERENCES usuario(id_usuario),
      id_pedido uuid UNIQUE REFERENCES pedido(id_pedido), motivo varchar(500),
      CHECK((estado='approved')=(id_pedido IS NOT NULL)))`);
    await q.query(`CREATE INDEX ix_solicitud_canje_expiry ON solicitud_canje(expira_en,id_canje) WHERE estado='pending'`);
    await q.query(`CREATE INDEX ix_solicitud_canje_client ON solicitud_canje(id_cliente,creada_en DESC,id_canje DESC)`);
    await q.query(`CREATE TABLE reserva_puntos_canje (
      id_reserva uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_canje uuid NOT NULL UNIQUE REFERENCES solicitud_canje(id_canje),
      id_cliente uuid NOT NULL REFERENCES cliente(id_cliente), puntos bigint NOT NULL CHECK(puntos>0),
      estado varchar(16) NOT NULL DEFAULT 'active' CHECK(estado IN ('active','consumed','released')), creada_en timestamptz NOT NULL DEFAULT now(), resuelta_en timestamptz)`);
    await q.query(`CREATE TABLE reserva_inventario_canje (
      id_reserva uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_canje uuid NOT NULL UNIQUE REFERENCES solicitud_canje(id_canje),
      id_inventario uuid NOT NULL REFERENCES inventario_diario(id_inventario), cantidad integer NOT NULL DEFAULT 1 CHECK(cantidad=1),
      estado varchar(16) NOT NULL DEFAULT 'active' CHECK(estado IN ('active','transferred','released')), creada_en timestamptz NOT NULL DEFAULT now(), resuelta_en timestamptz)`);
    await q.query(`CREATE TABLE historial_canje (
      id_historial uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_canje uuid NOT NULL REFERENCES solicitud_canje(id_canje),
      actor_usuario uuid REFERENCES usuario(id_usuario), evento varchar(32) NOT NULL, detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
      ocurrido_en timestamptz NOT NULL DEFAULT now())`);
    await q.query(`ALTER TABLE pedido ALTER COLUMN id_visita DROP NOT NULL, DROP CONSTRAINT pedido_origen_check,
      ADD CONSTRAINT pedido_origen_check CHECK(origen IN ('client','reward')),
      ADD COLUMN id_canje uuid UNIQUE REFERENCES solicitud_canje(id_canje),
      ADD CONSTRAINT ck_pedido_origen_canje CHECK((origen='reward')=(id_canje IS NOT NULL)),
      ADD CONSTRAINT ck_pedido_reward_local CHECK(origen<>'reward' OR (modalidad='local' AND id_visita IS NOT NULL AND actor_sesion_cliente IS NULL))`);
    await q.query(`ALTER TABLE movimiento_puntos ALTER COLUMN id_acumulacion DROP NOT NULL,
      ADD COLUMN id_canje uuid REFERENCES solicitud_canje(id_canje),
      DROP CONSTRAINT movimiento_puntos_tipo_check,
      ADD CONSTRAINT movimiento_puntos_tipo_check CHECK(tipo IN ('earn','refundAdjustment','redeem','redemptionReturn')),
      DROP CONSTRAINT movimiento_puntos_puntos_check,
      DROP CONSTRAINT movimiento_puntos_check,
      ADD CONSTRAINT movimiento_puntos_origen_check CHECK(
       (tipo IN ('earn','refundAdjustment') AND id_acumulacion IS NOT NULL AND id_canje IS NULL) OR
       (tipo IN ('redeem','redemptionReturn') AND id_acumulacion IS NULL AND id_canje IS NOT NULL)),
      ADD CONSTRAINT movimiento_puntos_puntos_check CHECK(puntos<>0 AND puntos BETWEEN -9007199254740991 AND 9007199254740991),
      ADD CONSTRAINT movimiento_puntos_signo_check CHECK(
       (tipo='earn' AND puntos>0 AND id_devolucion IS NULL) OR
       (tipo='refundAdjustment' AND puntos<0 AND id_devolucion IS NOT NULL) OR
       (tipo='redeem' AND puntos<0 AND id_devolucion IS NULL) OR
       (tipo='redemptionReturn' AND puntos>0 AND id_devolucion IS NULL))`);
    await q.query(`CREATE UNIQUE INDEX uq_movimiento_puntos_canje ON movimiento_puntos(id_canje,tipo) WHERE id_canje IS NOT NULL`);
    await q.query(`INSERT INTO permiso(codigo,descripcion) VALUES
      ('rewards.read','Consultar recompensas'),('rewards.manage','Administrar recompensas'),
      ('redemptions.read','Consultar canjes'),('redemptions.manage','Resolver canjes')`);
    await q.query(`INSERT INTO rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM rol r CROSS JOIN permiso p
      WHERE (r.codigo='admin' AND p.codigo IN('rewards.read','rewards.manage','redemptions.read','redemptions.manage'))
      OR (r.codigo='worker' AND p.codigo IN('rewards.read','redemptions.read','redemptions.manage'))`);
    await q.query(`CREATE FUNCTION proteger_historial_canje() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'El historial de canjes es inmutable.' USING ERRCODE='55000'; END; $$ LANGUAGE plpgsql`);
    await q.query(`ALTER TABLE historial_canje ADD CONSTRAINT fk_historial_canje_usuario FOREIGN KEY(actor_usuario) REFERENCES usuario(id_usuario) ON DELETE RESTRICT`);
    await q.query(`CREATE TRIGGER tr_historial_canje_inmutable BEFORE UPDATE OR DELETE ON historial_canje FOR EACH ROW EXECUTE FUNCTION proteger_historial_canje()`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM solicitud_canje) OR EXISTS(SELECT 1 FROM recompensa) OR EXISTS(SELECT 1 FROM movimiento_puntos WHERE id_canje IS NOT NULL) OR EXISTS(SELECT 1 FROM pedido WHERE origen='reward') THEN RAISE EXCEPTION 'No se puede revertir: existen recompensas, canjes o pedidos asociados'; END IF; END $$`);
    await q.query(`DELETE FROM rol_permiso WHERE id_permiso IN(SELECT id_permiso FROM permiso WHERE codigo IN('rewards.read','rewards.manage','redemptions.read','redemptions.manage'))`);
    await q.query(`DELETE FROM permiso WHERE codigo IN('rewards.read','rewards.manage','redemptions.read','redemptions.manage')`);
    await q.query(`ALTER TABLE pedido DROP CONSTRAINT ck_pedido_reward_local,DROP CONSTRAINT ck_pedido_origen_canje,DROP CONSTRAINT pedido_origen_check,DROP COLUMN id_canje, ADD CONSTRAINT pedido_origen_check CHECK(origen='client')`);
    await q.query(`DROP INDEX uq_movimiento_puntos_canje; ALTER TABLE movimiento_puntos DROP CONSTRAINT movimiento_puntos_signo_check,DROP CONSTRAINT movimiento_puntos_origen_check,DROP CONSTRAINT movimiento_puntos_tipo_check,DROP CONSTRAINT movimiento_puntos_puntos_check,DROP COLUMN id_canje, ALTER COLUMN id_acumulacion SET NOT NULL, ADD CONSTRAINT movimiento_puntos_puntos_check CHECK(puntos<>0 AND puntos BETWEEN -9007199254740991 AND 9007199254740991), ADD CONSTRAINT movimiento_puntos_tipo_check CHECK(tipo IN('earn','refundAdjustment')), ADD CONSTRAINT movimiento_puntos_check CHECK((tipo='earn' AND puntos>0 AND id_devolucion IS NULL) OR (tipo='refundAdjustment' AND puntos<0 AND id_devolucion IS NOT NULL))`);
    await q.query(`DROP TRIGGER tr_historial_canje_inmutable ON historial_canje; DROP TABLE historial_canje,reserva_inventario_canje,reserva_puntos_canje,solicitud_canje,recompensa`);
    await q.query(`DROP FUNCTION proteger_historial_canje()`);
  }
}
