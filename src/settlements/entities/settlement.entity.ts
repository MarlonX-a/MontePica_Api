import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ConsumptionAccount } from '../../accounts/entities/consumption-account.entity.js';
import { CashRegister } from '../../cash/entities/cash-register.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('liquidacion')
@Index('uq_liquidacion_pendiente_cuenta', ['id_cuenta'], {
  unique: true,
  where: "((estado)::text = 'pending'::text)",
})
@Check('liquidacion_productos_ctvs_check', '(productos_ctvs >= 0)')
@Check('liquidacion_check', '(total_ctvs = (productos_ctvs + envio_ctvs))')
@Check(
  'liquidacion_estado_check',
  "((estado)::text = ANY ((ARRAY['pending'::character varying, 'cancelled'::character varying, 'settled'::character varying])::text[]))",
)
@Check(
  'ck_liquidacion_resolucion',
  "((((estado)::text = 'settled'::text) AND (cerrada_en IS NOT NULL) AND (cerrada_por IS NOT NULL) AND (resolucion IS NOT NULL) AND ((resolucion)::text = ANY ((ARRAY['cash'::character varying, 'zeroTotal'::character varying, 'transfer'::character varying])::text[]))) OR (((estado)::text <> 'settled'::text) AND (cerrada_en IS NULL) AND (cerrada_por IS NULL) AND (resolucion IS NULL)))",
)
@Check('liquidacion_envio_ctvs_check', '(envio_ctvs >= 0)')
@Check(
  'liquidacion_check1',
  "((((estado)::text = ANY ((ARRAY['pending'::character varying, 'settled'::character varying])::text[])) AND (anulada_por IS NULL) AND (anulada_en IS NULL) AND (motivo_anulacion IS NULL)) OR (((estado)::text = 'cancelled'::text) AND (anulada_en IS NOT NULL) AND (length(TRIM(BOTH FROM motivo_anulacion)) > 0) AND ((anulada_por IS NOT NULL) OR ((motivo_anulacion)::text = 'receiptDeadlineExpired'::text))))",
)
export class Settlement {
  @Column({
    name: 'anulada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  anulada_en!: Date | null;
  @Column({ name: 'anulada_por', type: 'uuid', nullable: true })
  anulada_por!: string | null;
  @Column({
    name: 'motivo_anulacion',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  motivo_anulacion!: string | null;
  @Column({ name: 'id_cuenta', type: 'uuid', nullable: false })
  id_cuenta!: string;
  @Column({
    name: 'resolucion',
    type: 'character varying',
    nullable: true,
    length: 16,
  })
  resolucion!: string | null;
  @Column({
    name: 'cerrada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  cerrada_en!: Date | null;
  @Column({ name: 'productos_ctvs', type: 'bigint', nullable: false })
  productos_ctvs!: string;
  @Column({
    name: 'envio_ctvs',
    type: 'bigint',
    nullable: false,
    default: () => "'0'",
  })
  envio_ctvs!: string;
  @Column({ name: 'creada_por', type: 'uuid', nullable: false })
  creada_por!: string;
  @Column({ name: 'id_caja', type: 'uuid', nullable: false })
  id_caja!: string;
  @Column({ name: 'cerrada_por', type: 'uuid', nullable: true })
  cerrada_por!: string | null;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({ name: 'total_ctvs', type: 'bigint', nullable: false })
  total_ctvs!: string;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'pending'",
  })
  estado!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_liquidacion',
    primaryKeyConstraintName: 'liquidacion_pkey',
  })
  id_liquidacion!: string;
  @ManyToOne(() => ConsumptionAccount, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cuenta',
      referencedColumnName: 'id_cuenta',
      foreignKeyConstraintName: 'liquidacion_id_cuenta_fkey',
    },
  ])
  account?: Relation<ConsumptionAccount>;
  @ManyToOne(() => CashRegister, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_caja',
      referencedColumnName: 'id_caja',
      foreignKeyConstraintName: 'liquidacion_id_caja_fkey',
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
      name: 'creada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'liquidacion_creada_por_fkey',
    },
  ])
  user?: Relation<User>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'anulada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'liquidacion_anulada_por_fkey',
    },
  ])
  userRelation?: Relation<User>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'cerrada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'liquidacion_cerrada_por_fkey',
    },
  ])
  userRelationReference?: Relation<User>;
}
