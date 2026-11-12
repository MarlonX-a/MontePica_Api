import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { User } from './user.entity.js';

@Entity({ name: 'perfil' })
export class Profile {
  @PrimaryColumn({ name: 'id_usuario', type: 'uuid' })
  userId: string;

  @Column({ name: 'nombres', type: 'varchar', length: 160 })
  names: string;

  @Column({ name: 'apellidos', type: 'varchar', length: 160, nullable: true })
  lastNames: string | null;

  @Column({ name: 'telefono', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'id_usuario',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_perfil_usuario',
  })
  user?: Relation<User>;
}
