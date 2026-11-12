import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { Product } from '../../catalog/entities/product.entity.js';
import { OrderVersion } from './order-version.entity.js';

@Entity('detalle_pedido')
@Unique('detalle_pedido_id_version_id_producto_key', [
  'id_producto',
  'id_version',
])
@Check(
  'detalle_pedido_cantidad_check',
  '((cantidad >= 1) AND (cantidad <= 999))',
)
@Check(
  'detalle_pedido_precio_unitario_ctvs_check',
  '(precio_unitario_ctvs >= 0)',
)
export class OrderItem {
  @Column({ name: 'precio_unitario_ctvs', type: 'integer', nullable: false })
  precio_unitario_ctvs!: number;
  @Column({ name: 'id_version', type: 'uuid', nullable: false })
  id_version!: string;
  @Column({
    name: 'observaciones',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  observaciones!: string | null;
  @Column({ name: 'id_producto', type: 'uuid', nullable: false })
  id_producto!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_detalle',
    primaryKeyConstraintName: 'detalle_pedido_pkey',
  })
  id_detalle!: string;
  @Column({ name: 'cantidad', type: 'integer', nullable: false })
  cantidad!: number;
  @Column({ name: 'controla_stock_snapshot', type: 'boolean', nullable: false })
  controla_stock_snapshot!: boolean;
  @ManyToOne(() => OrderVersion, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_version',
      referencedColumnName: 'id_version',
      foreignKeyConstraintName: 'detalle_pedido_id_version_fkey',
    },
  ])
  orderVersion?: Relation<OrderVersion>;
  @ManyToOne(() => Product, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_producto',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'detalle_pedido_id_producto_fkey',
    },
  ])
  product?: Relation<Product>;
}
