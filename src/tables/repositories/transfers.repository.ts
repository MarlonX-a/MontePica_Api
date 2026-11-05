import { AuthorizationRepository } from '../../auth/repositories/authorization.repository.js';
import type { EntityManager } from 'typeorm';
export interface StaffFindUsuarioRow {
  activo: boolean;
  revocada_en: Date | null;
  valid: boolean;
}
export interface StaffFindUsuarioNextRow {
  '1': string;
}
export interface UploadFindLiquidacionRow {
  '1': string;
}
export interface UploadFindLiquidacionNextRow {
  id_cuenta: string;
  id_caja: string;
  id_cliente: string;
}
export interface UploadFindCajaRow {
  estado: string;
  day_status: string;
  current: boolean;
}
export interface UploadFindCuentaConsumoRow {
  estado: string;
}
export interface UploadFindLiquidacionNextNextRow {
  estado: string;
  total: number;
}
export interface UploadFindPagoRow {
  '1': string;
}
export interface UploadFindEntregaDomicilioRow {
  '1': string;
}
export interface UploadInsertPagoRow {
  id: string;
}
export interface UploadFindComprobanteRow {
  '1': string;
}
export interface DecideFindPagoRow {
  id_liquidacion: string;
  id_cuenta: string;
  id_caja: string;
  id_participante: string;
  modalidad: string;
  id_visita: string;
}
export interface DecideFindParticipanteRow {
  estado: string;
}
export interface DecideFindLiquidacionRow {
  estado: string;
}
export interface DecideFindPagoNextRow {
  estado: string;
  metodo: string;
}
export interface DecideFindPedidoRow {
  id_pedido: string;
}
export interface DecideFindLiquidacionNextRow {
  estado: string;
}
export interface ReceiptFindComprobanteRow {
  key: string;
  mime: string;
}
export class TransfersRepository {
  async staffFindUsuario(
    manager: EntityManager,
    input: { userId: string; sessionId: string },
  ): Promise<StaffFindUsuarioRow[]> {
    const row = await new AuthorizationRepository().lockSession(
      manager,
      input.userId,
      input.sessionId,
      undefined,
    );
    return row ? [row] : [];
  }
  async staffFindUsuarioNext(
    manager: EntityManager,
    input: { userId: string; permission: string },
  ): Promise<StaffFindUsuarioNextRow[]> {
    return (await new AuthorizationRepository().hasPermission(
      manager,
      input.userId,
      input.permission,
    ))
      ? [{ '1': '1' }]
      : [];
  }
  async uploadFindLiquidacion(
    manager: EntityManager,
    input: { id: string; clientId: string },
  ): Promise<UploadFindLiquidacionRow[]> {
    return manager.query<UploadFindLiquidacionRow[]>(
      `SELECT 1 FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE l.id_liquidacion=$1 AND c.id_cliente=$2`,
      [input.id, input.clientId],
    );
  }
  async uploadFindLiquidacionNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UploadFindLiquidacionNextRow[]> {
    return manager.query<UploadFindLiquidacionNextRow[]>(
      `SELECT l.id_cuenta,l.id_caja,c.id_cliente FROM liquidacion l JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE l.id_liquidacion=$1`,
      [input.id],
    );
  }
  async uploadFindCaja(
    manager: EntityManager,
    input: { id_caja: string; zone: string },
  ): Promise<UploadFindCajaRow[]> {
    return manager.query<UploadFindCajaRow[]>(
      `SELECT c.estado,j.estado AS day_status,j.fecha_operativa=timezone($2,clock_timestamp())::date AS current FROM caja c JOIN jornada_operativa j ON j.id_jornada=c.id_jornada WHERE c.id_caja=$1 FOR UPDATE OF j,c`,
      [input.id_caja, input.zone],
    );
  }
  async uploadFindCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<UploadFindCuentaConsumoRow[]> {
    return manager.query<UploadFindCuentaConsumoRow[]>(
      'SELECT estado FROM cuenta_consumo WHERE id_cuenta=$1 FOR UPDATE',
      [input.id_cuenta],
    );
  }
  async uploadFindLiquidacionNextNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UploadFindLiquidacionNextNextRow[]> {
    return manager.query<UploadFindLiquidacionNextNextRow[]>(
      'SELECT estado,total_ctvs::float8 AS total FROM liquidacion WHERE id_liquidacion=$1 FOR UPDATE',
      [input.id],
    );
  }
  async uploadFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<UploadFindPagoRow[]> {
    return manager.query<UploadFindPagoRow[]>(
      `SELECT 1 FROM pago WHERE id_liquidacion=$1 AND estado='pendingVerification'`,
      [input.id],
    );
  }
  async uploadFindEntregaDomicilio(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<UploadFindEntregaDomicilioRow[]> {
    return manager.query<UploadFindEntregaDomicilioRow[]>(
      `SELECT 1 FROM entrega_domicilio e JOIN pedido o ON o.id_pedido=e.id_pedido WHERE o.id_cuenta=$1 AND e.comprobante_hasta<=clock_timestamp()`,
      [input.id_cuenta],
    );
  }
  async uploadInsertPago(
    manager: EntityManager,
    input: {
      id: string;
      total: number;
      userId: string | null;
      guestSessionId: string | null;
      id_cliente: string;
    },
  ): Promise<UploadInsertPagoRow[]> {
    return manager.query<UploadInsertPagoRow[]>(
      `INSERT INTO pago(id_liquidacion,metodo,estado,importe_ctvs,registrado_usuario,registrado_sesion_cliente,pagador_cliente) VALUES ($1,'transfer','pendingVerification',$2,$3,$4,$5) RETURNING id_pago AS id`,
      [
        input.id,
        input.total,
        input.userId,
        input.guestSessionId,
        input.id_cliente,
      ],
    );
  }
  async uploadInsertComprobante(
    manager: EntityManager,
    input: {
      id: string;
      uploaded: string;
      mime: string;
      length: number;
      hash: string;
    },
  ): Promise<void> {
    await manager.query(
      'INSERT INTO comprobante(id_pago,archivo_privado,mime,tamano,sha256) VALUES ($1,$2,$3,$4,$5)',
      [input.id, input.uploaded, input.mime, input.length, input.hash],
    );
  }
  async uploadInsertHistorialPago(
    manager: EntityManager,
    input: { id: string; userId: string | null; guestSessionId: string | null },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pago(id_pago,actor_usuario,actor_sesion_cliente,estado_nuevo,evento) VALUES ($1,$2,$3,'pendingVerification','transfer.submitted')`,
      [input.id, input.userId, input.guestSessionId],
    );
  }
  async uploadFindComprobante(
    manager: EntityManager,
    input: { uploaded: string },
  ): Promise<UploadFindComprobanteRow[]> {
    return manager.query<UploadFindComprobanteRow[]>(
      'SELECT 1 FROM comprobante WHERE archivo_privado=$1',
      [input.uploaded],
    );
  }
  async decideFindPago(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindPagoRow[]> {
    return manager.query<DecideFindPagoRow[]>(
      `SELECT p.id_liquidacion,l.id_cuenta,l.id_caja,c.id_participante,c.modalidad,part.id_visita FROM pago p JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta LEFT JOIN participante part ON part.id_participante=c.id_participante WHERE p.id_pago=$1`,
      [input.id],
    );
  }
  async decideFindVisitaMesa(
    manager: EntityManager,
    input: { id_visita: string },
  ): Promise<void> {
    await manager.query(
      'SELECT 1 FROM visita_mesa WHERE id_visita=$1 FOR UPDATE',
      [input.id_visita],
    );
  }
  async decideFindParticipante(
    manager: EntityManager,
    input: { id_participante: string },
  ): Promise<DecideFindParticipanteRow[]> {
    return manager.query<DecideFindParticipanteRow[]>(
      'SELECT estado FROM participante WHERE id_participante=$1 FOR UPDATE',
      [input.id_participante],
    );
  }
  async decideFindLiquidacion(
    manager: EntityManager,
    input: { id_liquidacion: string },
  ): Promise<DecideFindLiquidacionRow[]> {
    return manager.query<DecideFindLiquidacionRow[]>(
      'SELECT estado FROM liquidacion WHERE id_liquidacion=$1 FOR UPDATE',
      [input.id_liquidacion],
    );
  }
  async decideFindPagoNext(
    manager: EntityManager,
    input: { id: string },
  ): Promise<DecideFindPagoNextRow[]> {
    return manager.query<DecideFindPagoNextRow[]>(
      'SELECT estado,metodo FROM pago WHERE id_pago=$1 FOR UPDATE',
      [input.id],
    );
  }
  async decideUpdatePago(
    manager: EntityManager,
    input: {
      id: string;
      status: 'rejected' | 'confirmed';
      userId: string;
      bankOperationReference: string | null;
      rejectionReason: string | null;
    },
  ): Promise<void> {
    await manager.query(
      `UPDATE pago SET estado=$2,verificado_por=$3,verificado_en=clock_timestamp(),operacion_bancaria_confirmada=$4,motivo_rechazo=$5 WHERE id_pago=$1`,
      [
        input.id,
        input.status,
        input.userId,
        input.bankOperationReference,
        input.rejectionReason,
      ],
    );
  }
  async decideUpdateLiquidacion(
    manager: EntityManager,
    input: { id_liquidacion: string; userId: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE liquidacion SET estado='settled',cerrada_en=clock_timestamp(),cerrada_por=$2,resolucion='transfer' WHERE id_liquidacion=$1`,
      [input.id_liquidacion, input.userId],
    );
  }
  async decideUpdateCuentaConsumo(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE cuenta_consumo SET estado='closed',cerrada_en=clock_timestamp() WHERE id_cuenta=$1`,
      [input.id_cuenta],
    );
  }
  async decideUpdateParticipante(
    manager: EntityManager,
    input: { id_participante: string },
  ): Promise<void> {
    await manager.query(
      `UPDATE participante SET estado='finished',finalizada_en=clock_timestamp() WHERE id_participante=$1`,
      [input.id_participante],
    );
  }
  async decideFindPedido(
    manager: EntityManager,
    input: { id_cuenta: string },
  ): Promise<DecideFindPedidoRow[]> {
    return manager.query<DecideFindPedidoRow[]>(
      `SELECT id_pedido FROM pedido WHERE id_cuenta=$1 AND modalidad='delivery'`,
      [input.id_cuenta],
    );
  }
  async decideInsertHistorialPago(
    manager: EntityManager,
    input: {
      id: string;
      userId: string;
      status: 'rejected' | 'confirmed';
      event: string;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO historial_pago(id_pago,actor_usuario,estado_anterior,estado_nuevo,evento) VALUES ($1,$2,'pendingVerification',$3,$4)`,
      [input.id, input.userId, input.status, input.event],
    );
  }
  async decideFindLiquidacionNext(
    manager: EntityManager,
    input: { id_liquidacion: string },
  ): Promise<DecideFindLiquidacionNextRow[]> {
    return manager.query<DecideFindLiquidacionNextRow[]>(
      'SELECT estado FROM liquidacion WHERE id_liquidacion=$1',
      [input.id_liquidacion],
    );
  }
  async receiptFindComprobante(
    manager: EntityManager,
    input: { id: string; clientId: string | null },
  ): Promise<ReceiptFindComprobanteRow[]> {
    return manager.query<ReceiptFindComprobanteRow[]>(
      `SELECT r.archivo_privado AS key,r.mime FROM comprobante r JOIN pago p ON p.id_pago=r.id_pago JOIN liquidacion l ON l.id_liquidacion=p.id_liquidacion JOIN cuenta_consumo c ON c.id_cuenta=l.id_cuenta WHERE p.id_pago=$1 AND ($2::uuid IS NULL OR c.id_cliente=$2)`,
      [input.id, input.clientId],
    );
  }
}
