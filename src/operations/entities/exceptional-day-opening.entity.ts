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
import { User } from '../../users/entities/user.entity.js';
import { OperatingDay } from './operating-day.entity.js';

@Entity('apertura_excepcional_jornada')
@Unique('apertura_excepcional_jornada_id_jornada_key', ['id_jornada'])
@Check(
  'apertura_excepcional_jornada_motivo_check',
  '((length(TRIM(BOTH FROM motivo)) >= 1) AND (length(TRIM(BOTH FROM motivo)) <= 500))',
)
@Check(
  'apertura_excepcional_jornada_jornadas_pendientes_check',
  '(cardinality(jornadas_pendientes) > 0)',
)
export class ExceptionalDayOpening {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_apertura_excepcional',
    primaryKeyConstraintName: 'apertura_excepcional_jornada_pkey',
  })
  id_apertura_excepcional!: string;
  @Column({
    name: 'abierta_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'clock_timestamp()',
  })
  abierta_en!: Date;
  @Column({ name: 'abierta_por', type: 'uuid', nullable: false })
  abierta_por!: string;
  @Column({
    name: 'jornadas_pendientes',
    type: 'uuid',
    nullable: false,
    array: true,
  })
  jornadas_pendientes!: string[];
  @Column({
    name: 'motivo',
    type: 'character varying',
    nullable: false,
    length: 500,
  })
  motivo!: string;
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
      foreignKeyConstraintName: 'apertura_excepcional_jornada_id_jornada_fkey',
    },
  ])
  operatingDay?: Relation<OperatingDay>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'abierta_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'apertura_excepcional_jornada_abierta_por_fkey',
    },
  ])
  user?: Relation<User>;
}
