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
import { CashRegister } from './cash-register.entity.js';

@Entity('cierre_caja')
@Unique('cierre_caja_id_caja_key', ['id_caja'])
@Check(
  'cierre_caja_fondo_inicial_ctvs_check',
  "((fondo_inicial_ctvs >= 0) AND (fondo_inicial_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'cierre_caja_ingresos_efectivo_ctvs_check',
  "((ingresos_efectivo_ctvs >= 0) AND (ingresos_efectivo_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'cierre_caja_devoluciones_efectivo_ctvs_check',
  "((devoluciones_efectivo_ctvs >= 0) AND (devoluciones_efectivo_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'cierre_caja_esperado_ctvs_check',
  "((esperado_ctvs >= '-9007199254740991'::bigint) AND (esperado_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'cierre_caja_contado_ctvs_check',
  "((contado_ctvs >= 0) AND (contado_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'cierre_caja_diferencia_ctvs_check',
  "((diferencia_ctvs >= '-9007199254740991'::bigint) AND (diferencia_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'ck_cierre_caja_calculo',
  '((esperado_ctvs = ((fondo_inicial_ctvs + ingresos_efectivo_ctvs) - devoluciones_efectivo_ctvs)) AND (diferencia_ctvs = (contado_ctvs - esperado_ctvs)))',
)
@Check(
  'ck_cierre_caja_justificacion',
  '((diferencia_ctvs = 0) OR ((justificacion IS NOT NULL) AND ((length(TRIM(BOTH FROM justificacion)) >= 1) AND (length(TRIM(BOTH FROM justificacion)) <= 500))))',
)
export class CashClosure {
  @Column({ name: 'fondo_inicial_ctvs', type: 'bigint', nullable: false })
  fondo_inicial_ctvs!: string;
  @Column({
    name: 'justificacion',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  justificacion!: string | null;
  @Column({ name: 'diferencia_ctvs', type: 'bigint', nullable: false })
  diferencia_ctvs!: string;
  @Column({ name: 'id_caja', type: 'uuid', nullable: false })
  id_caja!: string;
  @Column({
    name: 'cerrado_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'clock_timestamp()',
  })
  cerrado_en!: Date;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_cierre',
    primaryKeyConstraintName: 'cierre_caja_pkey',
  })
  id_cierre!: string;
  @Column({ name: 'cerrado_por', type: 'uuid', nullable: false })
  cerrado_por!: string;
  @Column({ name: 'contado_ctvs', type: 'bigint', nullable: false })
  contado_ctvs!: string;
  @Column({
    name: 'devoluciones_efectivo_ctvs',
    type: 'bigint',
    nullable: false,
  })
  devoluciones_efectivo_ctvs!: string;
  @Column({ name: 'esperado_ctvs', type: 'bigint', nullable: false })
  esperado_ctvs!: string;
  @Column({ name: 'ingresos_efectivo_ctvs', type: 'bigint', nullable: false })
  ingresos_efectivo_ctvs!: string;
  @ManyToOne(() => CashRegister, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_caja',
      referencedColumnName: 'id_caja',
      foreignKeyConstraintName: 'cierre_caja_id_caja_fkey',
    },
  ])
  cashRegister?: Relation<CashRegister>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'cerrado_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'cierre_caja_cerrado_por_fkey',
    },
  ])
  closedBy?: Relation<User>;
}
