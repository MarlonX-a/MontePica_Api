import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('permiso')
@Unique('uq_permiso_codigo', ['codigo'])
export class Permission {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_permiso',
    primaryKeyConstraintName: 'pk_permiso',
  })
  id_permiso!: string;
  @Column({
    name: 'descripcion',
    type: 'character varying',
    nullable: false,
    length: 200,
  })
  descripcion!: string;
  @Column({
    name: 'codigo',
    type: 'character varying',
    nullable: false,
    length: 80,
  })
  codigo!: string;
}
