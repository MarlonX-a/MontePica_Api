import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'rol' })
export class Role {
  @PrimaryGeneratedColumn('uuid', { name: 'id_rol' })
  id: string;

  @Column({ name: 'codigo', type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ name: 'nombre', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'estructural', type: 'boolean', default: true })
  structural: boolean;
}
