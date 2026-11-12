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
import { OperatingDay } from '../../operations/entities/operating-day.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('caja')
@Unique('uq_caja_jornada', ['id_jornada'])
@Check(
  'ck_caja_estado',
  "((estado)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying])::text[]))",
)
@Check('ck_caja_monto_inicial_no_negativo', '(monto_inicial_ctvs >= 0)')
export class CashRegister {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_caja',
    primaryKeyConstraintName: 'pk_caja',
  })
  id_caja!: string;
  @Column({ name: 'monto_inicial_ctvs', type: 'integer', nullable: false })
  monto_inicial_ctvs!: number;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'open'",
  })
  estado!: string;
  @Column({ name: 'abierta_por', type: 'uuid', nullable: false })
  abierta_por!: string;
  @Column({
    name: 'abierta_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  abierta_en!: Date;
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
      foreignKeyConstraintName: 'fk_caja_jornada',
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
      foreignKeyConstraintName: 'fk_caja_usuario',
    },
  ])
  user?: Relation<User>;
}
