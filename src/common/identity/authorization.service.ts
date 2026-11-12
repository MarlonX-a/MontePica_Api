import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { UserSession } from '../../auth/entities/user-session.entity.js';
import { StaffSessionState } from '../../auth/types/authorization.types.js';
import { Role } from '../../roles/entities/role.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Injectable()
export class AuthorizationService {
  async lockSession(
    manager: EntityManager,
    userId: string | undefined,
    sessionId: string | undefined,
    permission?: string,
  ): Promise<StaffSessionState | undefined> {
    if (!userId || !sessionId) return undefined;

    const [row] = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select(
        'u.activo, r.codigo AS role, s.revocada_en, s.expira_en>clock_timestamp() AS valid, EXISTS(SELECT 1 FROM rol_permiso rp JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE rp.id_rol=u.id_rol AND p.codigo=:value3) AS allowed',
      )
      .innerJoin(Role, 'r', 'r.id_rol=u.id_rol')
      .innerJoin(UserSession, 's', 's.id_usuario=u.id_usuario')
      .where('u.id_usuario=:userId AND s.id_sesion_usuario=:sessionId')
      .setLock('pessimistic_read', undefined, ['u', 's'])
      .setParameters({
        userId,
        sessionId,
        value3: permission ?? null,
      })
      .getRawMany();
    return row;
  }

  async hasPermission(
    manager: EntityManager,
    userId: string | undefined,
    permission: string,
  ): Promise<boolean> {
    if (!userId) return false;

    const [row] = await manager
      .createQueryBuilder()
      .select(
        'EXISTS(SELECT 1 FROM usuario u JOIN rol_permiso rp ON rp.id_rol=u.id_rol JOIN permiso p ON p.id_permiso=rp.id_permiso WHERE u.id_usuario=:userId AND p.codigo=:permission) AS allowed',
      )
      .from('(SELECT 1)', '_singleton')
      .setParameters({ userId, permission })
      .getRawMany();
    return row.allowed;
  }
}
