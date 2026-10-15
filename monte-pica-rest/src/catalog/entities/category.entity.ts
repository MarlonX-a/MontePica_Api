import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'categoria' })
@Check('ck_categoria_orden_no_negativo', 'orden >= 0')
export class Category {
  @PrimaryGeneratedColumn('uuid', { name: 'id_categoria' })
  id: string;

  @Column({ name: 'nombre_normalizado', type: 'varchar', length: 160, unique: true })
  normalizedName: string;

  @Column({ name: 'nombre', type: 'varchar', length: 160 })
  name: string;

  @Column({ name: 'activa', type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'orden', type: 'integer', default: 0 })
  sortOrder: number;

}
