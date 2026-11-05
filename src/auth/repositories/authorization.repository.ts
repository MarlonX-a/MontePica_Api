import type { EntityManager } from 'typeorm';

export interface StaffSessionState {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}

/** Locks the identity used to authorize a transaction; callers decide the required role and permission. */
export class AuthorizationRepository {
  async lockSession(
    manager: EntityManager,
    userId: string | undefined,
    sessionId: string | undefined,
    permission?: string,
  ): Promise<StaffSessionState | undefined> {
    if (!userId || !sessionId) return undefined;
    const [row] = await manager.query<StaffSessionState[]>(
      `SELECT u.activo,r.codigo AS role,s.revocada_en,s.expira_en>clock_timestamp() AS valid,
      EXISTS(SELECT 1 FROM rol_permiso rp JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE rp.id_rol=u.id_rol AND p.codigo=$3) AS allowed
      FROM usuario u JOIN rol r ON r.id_rol=u.id_rol JOIN sesion_usuario s ON s.id_usuario=u.id_usuario
      WHERE u.id_usuario=$1 AND s.id_sesion_usuario=$2 FOR SHARE OF u,s`,
      [userId, sessionId, permission ?? null],
    );
    return row;
  }
  async hasPermission(
    manager: EntityManager,
    userId: string | undefined,
    permission: string,
  ): Promise<boolean> {
    if (!userId) return false;
    const [row] = await manager.query<Array<{ allowed: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=$1 AND p.codigo=$2) AS allowed`,
      [userId, permission],
    );
    return row.allowed;
  }
}
