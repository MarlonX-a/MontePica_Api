import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'cliente' })
export class Client {
  @PrimaryGeneratedColumn('uuid', { name: 'id_cliente' })
  id: string;

  @Column({ name: 'id_usuario', type: 'uuid', unique: true, nullable: true })
  userId: string | null;

  @Column({ name: 'nombre_contacto', type: 'varchar', length: 160, nullable: true })
  contactName: string | null;

  @Column({ name: 'telefono', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
