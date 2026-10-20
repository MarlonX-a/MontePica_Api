import { Column, Entity, PrimaryColumn } from 'typeorm';

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
}
