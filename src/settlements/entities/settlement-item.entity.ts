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
import { ConsumptionAssignment } from '../../accounts/entities/consumption-assignment.entity.js';
import { Settlement } from './settlement.entity.js';

@Entity('detalle_liquidacion')
@Unique('detalle_liquidacion_id_liquidacion_id_asignacion_key', [
  'id_asignacion',
  'id_liquidacion',
])
@Index('uq_detalle_liquidacion_asignacion_vigente', ['id_asignacion'], {
  unique: true,
  where: 'vigente',
})
@Check('detalle_liquidacion_cantidad_snapshot_check', '(cantidad_snapshot > 0)')
@Check(
  'detalle_liquidacion_precio_snapshot_ctvs_check',
  '(precio_snapshot_ctvs >= 0)',
)
@Check(
  'detalle_liquidacion_check',
  '(importe_ctvs = ((cantidad_snapshot)::bigint * precio_snapshot_ctvs))',
)
export class SettlementItem {
  @Column({ name: 'precio_snapshot_ctvs', type: 'integer', nullable: false })
  precio_snapshot_ctvs!: number;
  @Column({ name: 'id_liquidacion', type: 'uuid', nullable: false })
  id_liquidacion!: string;
  @Column({ name: 'cantidad_snapshot', type: 'integer', nullable: false })
  cantidad_snapshot!: number;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_detalle_liquidacion',
    primaryKeyConstraintName: 'detalle_liquidacion_pkey',
  })
  id_detalle_liquidacion!: string;
  @Column({ name: 'id_asignacion', type: 'uuid', nullable: false })
  id_asignacion!: string;
  @Column({
    name: 'vigente',
    type: 'boolean',
    nullable: false,
    default: () => 'true',
  })
  vigente!: boolean;
  @Column({ name: 'importe_ctvs', type: 'bigint', nullable: false })
  importe_ctvs!: string;
  @ManyToOne(() => Settlement, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_liquidacion',
      referencedColumnName: 'id_liquidacion',
      foreignKeyConstraintName: 'detalle_liquidacion_id_liquidacion_fkey',
    },
  ])
  settlement?: Relation<Settlement>;
  @ManyToOne(() => ConsumptionAssignment, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_asignacion',
      referencedColumnName: 'id_asignacion',
      foreignKeyConstraintName: 'detalle_liquidacion_id_asignacion_fkey',
    },
  ])
  consumptionAssignment?: Relation<ConsumptionAssignment>;
}
