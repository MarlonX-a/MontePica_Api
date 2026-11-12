import {
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Permission } from './permission.entity.js';
import { Role } from './role.entity.js';

@Entity('rol_permiso')
export class RolePermission {
  @PrimaryColumn({
    name: 'id_rol',
    type: 'uuid',
    nullable: false,
    primaryKeyConstraintName: 'pk_rol_permiso',
  })
  id_rol!: string;
  @PrimaryColumn({
    name: 'id_permiso',
    type: 'uuid',
    nullable: false,
    primaryKeyConstraintName: 'pk_rol_permiso',
  })
  id_permiso!: string;
  @ManyToOne(() => Role, {
    nullable: false,
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_rol',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_rol_permiso_rol',
    },
  ])
  role?: Relation<Role>;
  @ManyToOne(() => Permission, {
    nullable: false,
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_permiso',
      referencedColumnName: 'id_permiso',
      foreignKeyConstraintName: 'fk_rol_permiso_permiso',
    },
  ])
  permission?: Relation<Permission>;
}
