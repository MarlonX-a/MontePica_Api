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
import { OrderItem } from '../../orders/entities/order-item.entity.js';
import { ConsumptionAccount } from './consumption-account.entity.js';

@Entity('asignacion_consumo')
@Unique('asignacion_consumo_id_detalle_id_cuenta_key', [
  'id_cuenta',
  'id_detalle',
])
@Check('asignacion_consumo_cantidad_check', '(cantidad > 0)')
@Check(
  'asignacion_consumo_estado_check',
  "((estado)::text = ANY ((ARRAY['active'::character varying, 'superseded'::character varying])::text[]))",
)
export class ConsumptionAssignment {
  @Column({ name: 'id_detalle', type: 'uuid', nullable: false })
  id_detalle!: string;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 20,
    default: () => "'active'",
  })
  estado!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({ name: 'id_cuenta', type: 'uuid', nullable: false })
  id_cuenta!: string;
  @Column({ name: 'cantidad', type: 'integer', nullable: false })
  cantidad!: number;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_asignacion',
    primaryKeyConstraintName: 'asignacion_consumo_pkey',
  })
  id_asignacion!: string;
  @ManyToOne(() => OrderItem, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_detalle',
      referencedColumnName: 'id_detalle',
      foreignKeyConstraintName: 'asignacion_consumo_id_detalle_fkey',
    },
  ])
  orderItem?: Relation<OrderItem>;
  @ManyToOne(() => ConsumptionAccount, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cuenta',
      referencedColumnName: 'id_cuenta',
      foreignKeyConstraintName: 'asignacion_consumo_id_cuenta_fkey',
    },
  ])
  account?: Relation<ConsumptionAccount>;
}
