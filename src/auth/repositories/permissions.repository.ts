import type { EntityManager } from 'typeorm';
export class PermissionsRepository {
  async forUser(manager: EntityManager, userId: string): Promise<string[]> {
    const rows = await manager.query<Array<{ codigo: string }>>(
      `SELECT p.codigo FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=$1 AND u.activo=true`,
      [userId],
    );
    return rows.map((row) => row.codigo);
  }
  async forRole(manager: EntityManager, roleId: string): Promise<string[]> {
    const rows = await manager.query<Array<{ codigo: string }>>(
      `SELECT p.codigo FROM permiso p JOIN rol_permiso rp ON rp.id_permiso=p.id_permiso WHERE rp.id_rol=$1 ORDER BY p.codigo`,
      [roleId],
    );
    return rows.map((row) => row.codigo);
  }
  async clientIdentity(
    manager: EntityManager,
    userId: string,
  ): Promise<{ clientId: string | null; roleCode: string } | undefined> {
    const [row] = await manager.query<
      Array<{ clientId: string | null; roleCode: string }>
    >(
      `SELECT c.id_cliente AS "clientId",r.codigo AS "roleCode" FROM usuario u JOIN rol r ON r.id_rol=u.id_rol LEFT JOIN cliente c ON c.id_usuario=u.id_usuario WHERE u.id_usuario=$1 AND u.activo=true`,
      [userId],
    );
    return row;
  }
}
