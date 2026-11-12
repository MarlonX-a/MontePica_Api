import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity.js';

@Entity({ name: 'usuario' })
@Check('ck_usuario_version_acceso', '(version_acceso >= 0)')
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'id_usuario' })
  id: string;

  @Column({
    name: 'correo_normalizado',
    type: 'varchar',
    length: 320,
    unique: true,
  })
  normalizedEmail: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ name: 'activo', type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'version_acceso', type: 'integer', default: 0 })
  accessVersion: number;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @ManyToOne(() => Role, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'id_rol',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_usuario_rol',
  })
  role: Role;
}
