import { Category } from './category.entity.js';
import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'producto' })
@Check('ck_producto_precio_ctvs_no_negativo', 'precio_ctvs >= 0')
@Check('ck_producto_orden_no_negativo', 'orden >= 0')
export class Product {
  @PrimaryGeneratedColumn('uuid', { name: 'id_producto' })
  id: string;

  @Column({ name: 'sku', type: 'varchar', length: 80, unique: true })
  sku: string;

  @Column({ name: 'nombre', type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'precio_ctvs', type: 'integer' })
  priceCents: number;

  @Column({ name: 'imagen_url', type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ name: 'activo', type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'visible_menu', type: 'boolean', default: true })
  visibleInMenu: boolean;

  @Column({ name: 'controla_inventario', type: 'boolean', default: true })
  tracksInventory: boolean;

  @Column({ name: 'orden', type: 'integer', default: 0 })
  sortOrder: number;

  @ManyToOne(() => Category, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_categoria', referencedColumnName: 'id' })
  category: Category;
}
