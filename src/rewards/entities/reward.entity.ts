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
import { Product } from '../../catalog/entities/product.entity.js';

@Entity('recompensa')
@Index(
  'ix_recompensa_publica',
  ['activa', 'id_recompensa', 'nombre', 'orden'],
  { unique: false },
)
@Check(
  'recompensa_costo_puntos_check',
  "((costo_puntos >= 1) AND (costo_puntos <= '9007199254740991'::bigint))",
)
@Check('recompensa_orden_check', '(orden >= 0)')
@Check('recompensa_version_check', '(version > 0)')
export class Reward {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_recompensa',
    primaryKeyConstraintName: 'recompensa_pkey',
  })
  id_recompensa!: string;
  @Column({ name: 'id_producto', type: 'uuid', nullable: false })
  id_producto!: string;
  @Column({
    name: 'orden',
    type: 'integer',
    nullable: false,
    default: () => "'0'",
  })
  orden!: number;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({
    name: 'descripcion',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  descripcion!: string | null;
  @Column({
    name: 'version',
    type: 'integer',
    nullable: false,
    default: () => "'1'",
  })
  version!: number;
  @Column({
    name: 'activa',
    type: 'boolean',
    nullable: false,
    default: () => 'true',
  })
  activa!: boolean;
  @Column({ name: 'costo_puntos', type: 'bigint', nullable: false })
  costo_puntos!: string;
  @Column({
    name: 'nombre',
    type: 'character varying',
    nullable: false,
    length: 160,
  })
  nombre!: string;
  @Column({
    name: 'actualizada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  actualizada_en!: Date;
  @ManyToOne(() => Product, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_producto',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'recompensa_id_producto_fkey',
    },
  ])
  product?: Relation<Product>;
}
