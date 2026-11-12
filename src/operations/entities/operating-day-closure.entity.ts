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
import { CashClosure } from '../../cash/entities/cash-closure.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { OperatingDay } from './operating-day.entity.js';

@Entity('cierre_jornada')
@Unique('cierre_jornada_id_jornada_key', ['id_jornada'])
@Unique('cierre_jornada_id_cierre_caja_key', ['id_cierre_caja'])
@Check(
  'cierre_jornada_resumen_check',
  "(jsonb_typeof(resumen) = 'object'::text)",
)
export class OperatingDayClosure {
  @Column({
    name: 'observaciones',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  observaciones!: string | null;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_cierre',
    primaryKeyConstraintName: 'cierre_jornada_pkey',
  })
  id_cierre!: string;
  @Column({ name: 'cerrado_por', type: 'uuid', nullable: false })
  cerrado_por!: string;
  @Column({ name: 'resumen', type: 'jsonb', nullable: false })
  resumen!: Record<string, unknown>;
  @Column({ name: 'id_cierre_caja', type: 'uuid', nullable: true })
  id_cierre_caja!: string | null;
  @Column({ name: 'id_jornada', type: 'uuid', nullable: false })
  id_jornada!: string;
  @Column({
    name: 'cerrado_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'clock_timestamp()',
  })
  cerrado_en!: Date;
  @ManyToOne(() => CashClosure, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cierre_caja',
      referencedColumnName: 'id_cierre',
      foreignKeyConstraintName: 'cierre_jornada_id_cierre_caja_fkey',
    },
  ])
  cashClosure?: Relation<CashClosure>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'cerrado_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'cierre_jornada_cerrado_por_fkey',
    },
  ])
  closedBy?: Relation<User>;
  @ManyToOne(() => OperatingDay, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_jornada',
      referencedColumnName: 'id_jornada',
      foreignKeyConstraintName: 'cierre_jornada_id_jornada_fkey',
    },
  ])
  operatingDay?: Relation<OperatingDay>;
}
