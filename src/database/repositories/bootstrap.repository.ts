import type { EntityManager } from 'typeorm';
import { OperationalLockRepository } from './operational-lock.repository.js';
export class BootstrapRepository {
  async lockAdministratorCreation(manager: EntityManager): Promise<void> {
    await new OperationalLockRepository().acquireAdministratorMembership(
      manager,
    );
  }
  async countAdministrators(manager: EntityManager): Promise<number> {
    const [row] = await manager.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS total FROM usuario u JOIN rol r ON r.id_rol=u.id_rol WHERE r.codigo='admin'`,
    );
    return row.total;
  }
  async emailExists(manager: EntityManager, email: string): Promise<boolean> {
    const rows = await manager.query<Array<{ exists: number }>>(
      'SELECT 1 AS exists FROM usuario WHERE correo_normalizado=$1',
      [email],
    );
    return rows.length > 0;
  }
  async findAdministratorRole(
    manager: EntityManager,
  ): Promise<string | undefined> {
    const [row] = await manager.query<Array<{ id_rol: string }>>(
      `SELECT id_rol FROM rol WHERE codigo='admin'`,
    );
    return row?.id_rol;
  }
  async insertAdministrator(
    manager: EntityManager,
    roleId: string,
    email: string,
    passwordHash: string,
  ): Promise<string> {
    const [row] = await manager.query<Array<{ id_usuario: string }>>(
      `INSERT INTO usuario(id_rol,correo_normalizado,password_hash,activo) VALUES($1,$2,$3,true) RETURNING id_usuario`,
      [roleId, email, passwordHash],
    );
    return row.id_usuario;
  }
  async insertProfile(
    manager: EntityManager,
    id: string,
    name: string,
    phone: string | null,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO perfil(id_usuario,nombres,apellidos,telefono) VALUES($1,$2,NULL,$3)`,
      [id, name, phone],
    );
  }
}
