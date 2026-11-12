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
import { DailyInventory } from '../../inventory/entities/daily-inventory.entity.js';
import { OrderItem } from './order-item.entity.js';

@Entity('reserva_inventario')
@Unique('reserva_inventario_id_detalle_key', ['id_detalle'])
@Check('reserva_inventario_cantidad_check', '(cantidad > 0)')
@Check(
  'reserva_inventario_estado_check',
  "((estado)::text = ANY ((ARRAY['active'::character varying, 'released'::character varying, 'consumed'::character varying])::text[]))",
)
export class InventoryReservation {
  @Column({ name: 'cantidad', type: 'integer', nullable: false })
  cantidad!: number;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_reserva',
    primaryKeyConstraintName: 'reserva_inventario_pkey',
  })
  id_reserva!: string;
  @Column({ name: 'id_inventario', type: 'uuid', nullable: false })
  id_inventario!: string;
  @Column({
    name: 'resuelta_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  resuelta_en!: Date | null;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 20,
    default: () => "'active'",
  })
  estado!: string;
  @Column({ name: 'id_detalle', type: 'uuid', nullable: false })
  id_detalle!: string;
  @ManyToOne(() => OrderItem, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_detalle',
      referencedColumnName: 'id_detalle',
      foreignKeyConstraintName: 'reserva_inventario_id_detalle_fkey',
    },
  ])
  orderItem?: Relation<OrderItem>;
  @ManyToOne(() => DailyInventory, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_inventario',
      referencedColumnName: 'id_inventario',
      foreignKeyConstraintName: 'reserva_inventario_id_inventario_fkey',
    },
  ])
  dailyInventory?: Relation<DailyInventory>;
}
