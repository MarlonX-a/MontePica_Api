import { IsNull, MoreThan, type EntityManager } from 'typeorm';
import { Client } from '../entities/client.entity.js';
import { Profile } from '../entities/profile.entity.js';
import { Role } from '../entities/role.entity.js';
import { UserSession } from '../entities/user-session.entity.js';
import { User } from '../entities/user.entity.js';

export class IdentityRepository {
  findSession(manager: EntityManager, sessionId: string, userId: string) {
    return manager
      .getRepository(UserSession)
      .findOne({
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
    const [row] = await manager.query<Array<{ id_rol: string }>>(
      'SELECT id_rol FROM usuario WHERE id_usuario=$1',
      [userId],
    );
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
