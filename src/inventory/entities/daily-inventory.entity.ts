import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { Product } from '../../catalog/entities/product.entity.js';
import { OperatingDay } from '../../operations/entities/operating-day.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('inventario_diario')
@Unique('uq_inventario_diario_jornada_producto', ['id_jornada', 'id_producto'])
@Index('ix_inventario_diario_jornada', ['id_jornada', 'id_producto'], {
  unique: false,
})
@Check('ck_inventario_diario_cantidad_inicial', '(cantidad_inicial >= 0)')
@Check('ck_inventario_diario_cantidad_fisica', '(cantidad_fisica >= 0)')
@Check(
  'ck_inventario_diario_cantidad_reservada',
  '((cantidad_reservada >= 0) AND (cantidad_reservada <= cantidad_fisica))',
)
export class DailyInventory {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_inventario',
    primaryKeyConstraintName: 'pk_inventario_diario',
  })
  id_inventario!: string;
  @Column({ name: 'cantidad_inicial', type: 'integer', nullable: false })
  cantidad_inicial!: number;
  @Column({ name: 'inicializado_por', type: 'uuid', nullable: false })
  inicializado_por!: string;
  @Column({ name: 'id_producto', type: 'uuid', nullable: false })
  id_producto!: string;
  @Column({
    name: 'inicializado_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  inicializado_en!: Date;
  @Column({
    name: 'cantidad_reservada',
    type: 'integer',
    nullable: false,
    default: () => "'0'",
  })
  cantidad_reservada!: number;
  @Column({ name: 'cantidad_fisica', type: 'integer', nullable: false })
  cantidad_fisica!: number;
  @Column({ name: 'id_jornada', type: 'uuid', nullable: false })
  id_jornada!: string;
  @ManyToOne(() => OperatingDay, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_jornada',
      referencedColumnName: 'id_jornada',
      foreignKeyConstraintName: 'fk_inventario_diario_jornada',
    },
  ])
  operatingDay?: Relation<OperatingDay>;
  @ManyToOne(() => Product, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_producto',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_inventario_diario_producto',
    },
  ])
  product?: Relation<Product>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'inicializado_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_inventario_diario_usuario',
    },
  ])
  user?: Relation<User>;
}
