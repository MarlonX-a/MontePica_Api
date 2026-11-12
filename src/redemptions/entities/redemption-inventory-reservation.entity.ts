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
import { RedemptionRequest } from './redemption-request.entity.js';

@Entity('reserva_inventario_canje')
@Unique('reserva_inventario_canje_id_canje_key', ['id_canje'])
@Check('reserva_inventario_canje_cantidad_check', '(cantidad = 1)')
@Check(
  'reserva_inventario_canje_estado_check',
  "((estado)::text = ANY ((ARRAY['active'::character varying, 'transferred'::character varying, 'released'::character varying])::text[]))",
)
export class RedemptionInventoryReservation {
  @Column({
    name: 'resuelta_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  resuelta_en!: Date | null;
  @Column({ name: 'id_inventario', type: 'uuid', nullable: false })
  id_inventario!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_reserva',
    primaryKeyConstraintName: 'reserva_inventario_canje_pkey',
  })
  id_reserva!: string;
  @Column({
    name: 'cantidad',
    type: 'integer',
    nullable: false,
    default: () => "'1'",
  })
  cantidad!: number;
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
    length: 16,
    default: () => "'active'",
  })
  estado!: string;
  @Column({ name: 'id_canje', type: 'uuid', nullable: false })
  id_canje!: string;
  @ManyToOne(() => RedemptionRequest, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_canje',
      referencedColumnName: 'id_canje',
      foreignKeyConstraintName: 'reserva_inventario_canje_id_canje_fkey',
    },
  ])
  redemption?: Relation<RedemptionRequest>;
  @ManyToOne(() => DailyInventory, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_inventario',
      referencedColumnName: 'id_inventario',
      foreignKeyConstraintName: 'reserva_inventario_canje_id_inventario_fkey',
    },
  ])
  dailyInventory?: Relation<DailyInventory>;
}
