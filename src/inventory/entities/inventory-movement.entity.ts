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
import { InventoryReservation } from '../../orders/entities/inventory-reservation.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { DailyInventory } from './daily-inventory.entity.js';

@Entity('movimiento_inventario')
@Unique('movimiento_inventario_id_reserva_key', ['id_reserva'])
@Index(
  'ix_movimiento_inventario_inventario_fecha',
  ['id_inventario', 'id_movimiento', 'ocurrido_en'],
  { unique: false },
)
@Check(
  'ck_movimiento_inventario_cantidades',
  '((cantidad_anterior >= 0) AND (cantidad_posterior >= 0))',
)
@Check(
  'ck_movimiento_inventario_delta',
  '((cantidad_posterior - cantidad_anterior) = delta_fisico)',
)
@Check(
  'ck_movimiento_inventario_tipo',
  "((tipo)::text = ANY ((ARRAY['initialization'::character varying, 'restock'::character varying, 'internalConsumption'::character varying, 'giveaway'::character varying, 'waste'::character varying, 'adjustment'::character varying, 'orderConsumption'::character varying])::text[]))",
)
export class InventoryMovement {
  @Column({ name: 'id_reserva', type: 'uuid', nullable: true })
  id_reserva!: string | null;
  @Column({ name: 'id_inventario', type: 'uuid', nullable: false })
  id_inventario!: string;
  @Column({ name: 'delta_fisico', type: 'integer', nullable: false })
  delta_fisico!: number;
  @Column({ name: 'cantidad_anterior', type: 'integer', nullable: false })
  cantidad_anterior!: number;
  @Column({
    name: 'motivo',
    type: 'character varying',
    nullable: false,
    length: 500,
  })
  motivo!: string;
  @Column({ name: 'registrado_por', type: 'uuid', nullable: false })
  registrado_por!: string;
  @Column({
    name: 'ocurrido_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  ocurrido_en!: Date;
  @Column({ name: 'cantidad_posterior', type: 'integer', nullable: false })
  cantidad_posterior!: number;
  @Column({
    name: 'tipo',
    type: 'character varying',
    nullable: false,
    length: 32,
  })
  tipo!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_movimiento',
    primaryKeyConstraintName: 'pk_movimiento_inventario',
  })
  id_movimiento!: string;
  @ManyToOne(() => DailyInventory, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_inventario',
      referencedColumnName: 'id_inventario',
      foreignKeyConstraintName: 'fk_movimiento_inventario_inventario',
    },
  ])
  dailyInventory?: Relation<DailyInventory>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'registrado_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_movimiento_inventario_usuario',
    },
  ])
  registeredBy?: Relation<User>;
  @ManyToOne(() => InventoryReservation, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_reserva',
      referencedColumnName: 'id_reserva',
      foreignKeyConstraintName: 'movimiento_inventario_id_reserva_fkey',
    },
  ])
  inventoryReservation?: Relation<InventoryReservation>;
}
