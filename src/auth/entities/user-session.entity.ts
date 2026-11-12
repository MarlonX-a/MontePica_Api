import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity({ name: 'sesion_usuario' })
@Index('ix_sesion_usuario_usuario_vigente', ['expiresAt', 'userId'], {
  unique: false,
  where: '(revocada_en IS NULL)',
})
@Check('ck_sesion_usuario_generacion', '(generacion >= 0)')
@Check('ck_sesion_usuario_expiracion', '(expira_en > creada_en)')
export class UserSession {
  @PrimaryGeneratedColumn('uuid', { name: 'id_sesion_usuario' })
  id: string;

  @Column({ name: 'id_usuario', type: 'uuid' })
  userId: string;

  @Column({ name: 'refresh_hash', type: 'char', length: 64, unique: true })
  refreshHash: string;

  @Column({ name: 'generacion', type: 'integer', default: 0 })
  generation: number;

  @Column({ name: 'creada_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revocada_en', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'id_usuario',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_sesion_usuario_usuario',
  })
  user?: Relation<User>;
}
