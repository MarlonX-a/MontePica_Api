import { Injectable } from '@nestjs/common';
import { type EntityManager, IsNull, MoreThan } from 'typeorm';
import { UserSession } from '../../auth/entities/user-session.entity.js';
import { Role } from '../../roles/entities/role.entity.js';
import { Profile } from '../../users/entities/profile.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Client } from './entities/client.entity.js';

@Injectable()
export class IdentityService {
  findSession(manager: EntityManager, sessionId: string, userId: string) {
    return manager.getRepository(UserSession).findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  findActiveUser(manager: EntityManager, id: string) {
    return manager.getRepository(User).findOne({ where: { id, active: true } });
  }

  findActiveUserWithRole(manager: EntityManager, id: string) {
    return manager
      .getRepository(User)
      .findOne({ where: { id, active: true }, relations: { role: true } });
  }

  findSessionByRefreshHash(manager: EntityManager, refreshHash: string) {
    return manager.getRepository(UserSession).findOneBy({ refreshHash });
  }

  lockUserByEmail(manager: EntityManager, normalizedEmail: string) {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .setLock('pessimistic_write')
      .where('user.normalizedEmail = :normalizedEmail', { normalizedEmail })
      .getOne();
  }

  lockActiveUser(manager: EntityManager, userId: string) {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .andWhere('user.active = true')
      .getOne();
  }

  lockUserWithPassword(manager: EntityManager, userId: string) {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne();
  }

  lockRefreshSession(manager: EntityManager, oldHash: string) {
    return manager
      .getRepository(UserSession)
      .createQueryBuilder('session')
      .setLock('pessimistic_write')
      .where('session.refreshHash = :oldHash', { oldHash })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now: new Date() })
      .getOne();
  }

  findRoleByCode(manager: EntityManager, code: string) {
    return manager.getRepository(Role).findOneBy({ code });
  }

  async findUserRole(manager: EntityManager, userId: string): Promise<Role> {
    const [row] = await manager
      .getRepository(User)
      .createQueryBuilder('usuario')
      .select('id_rol AS "id_rol"')
      .where('id_usuario=:userId')
      .setParameters({ userId })
      .getRawMany();
    return manager.getRepository(Role).findOneByOrFail({ id: row.id_rol });
  }

  findProfile(manager: EntityManager, userId: string) {
    return manager.getRepository(Profile).findOneByOrFail({ userId });
  }

  findClient(manager: EntityManager, userId: string) {
    return manager.getRepository(Client).findOneBy({ userId });
  }

  saveUser(manager: EntityManager, user: User) {
    return manager.getRepository(User).save(user);
  }

  createUser(
    manager: EntityManager,
    input: Pick<
      User,
      'normalizedEmail' | 'passwordHash' | 'active' | 'accessVersion' | 'role'
    >,
  ) {
    const repository = manager.getRepository(User);
    return repository.save(repository.create(input));
  }

  createProfile(
    manager: EntityManager,
    input: Pick<Profile, 'userId' | 'names' | 'lastNames' | 'phone'>,
  ) {
    const repository = manager.getRepository(Profile);
    return repository.save(repository.create(input));
  }

  createClient(
    manager: EntityManager,
    input: Pick<Client, 'userId' | 'contactName' | 'phone'>,
  ) {
    const repository = manager.getRepository(Client);
    return repository.save(repository.create(input));
  }

  createSession(
    manager: EntityManager,
    input: Pick<
      UserSession,
      'userId' | 'refreshHash' | 'generation' | 'expiresAt' | 'revokedAt'
    >,
  ) {
    const repository = manager.getRepository(UserSession);
    return repository.save(repository.create(input));
  }

  saveSession(manager: EntityManager, session: UserSession) {
    return manager.getRepository(UserSession).save(session);
  }

  async revokeByRefreshHash(
    manager: EntityManager,
    refreshHash: string,
  ): Promise<void> {
    await manager
      .getRepository(UserSession)
      .createQueryBuilder()
      .update(UserSession)
      .set({ revokedAt: new Date() })
      .where('refreshHash = :refreshHash', { refreshHash })
      .andWhere('revokedAt IS NULL')
      .execute();
  }

  async revokeUserSessions(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager
      .getRepository(UserSession)
      .createQueryBuilder()
      .update(UserSession)
      .set({ revokedAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere('revokedAt IS NULL')
      .execute();
  }
}
