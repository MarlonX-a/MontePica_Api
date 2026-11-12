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
import { Client } from '../../common/identity/entities/client.entity.js';
import { RedemptionRequest } from '../../redemptions/entities/redemption-request.entity.js';
import { Refund } from '../../refunds/entities/refund.entity.js';
import { PointsAccrual } from './points-accrual.entity.js';

@Entity('movimiento_puntos')
@Unique('movimiento_puntos_id_devolucion_key', ['id_devolucion'])
@Index('uq_movimiento_puntos_canje', ['id_canje', 'tipo'], {
  unique: true,
  where: '(id_canje IS NOT NULL)',
})
@Index('uq_puntos_acreditacion', ['id_acumulacion'], {
  unique: true,
  where: "((tipo)::text = 'earn'::text)",
})
@Check(
  'movimiento_puntos_tipo_check',
  "((tipo)::text = ANY ((ARRAY['earn'::character varying, 'refundAdjustment'::character varying, 'redeem'::character varying, 'redemptionReturn'::character varying])::text[]))",
)
@Check(
  'movimiento_puntos_origen_check',
  "((((tipo)::text = ANY ((ARRAY['earn'::character varying, 'refundAdjustment'::character varying])::text[])) AND (id_acumulacion IS NOT NULL) AND (id_canje IS NULL)) OR (((tipo)::text = ANY ((ARRAY['redeem'::character varying, 'redemptionReturn'::character varying])::text[])) AND (id_acumulacion IS NULL) AND (id_canje IS NOT NULL)))",
)
@Check(
  'movimiento_puntos_puntos_check',
  "((puntos <> 0) AND ((puntos >= '-9007199254740991'::bigint) AND (puntos <= '9007199254740991'::bigint)))",
)
@Check(
  'movimiento_puntos_signo_check',
  "((((tipo)::text = 'earn'::text) AND (puntos > 0) AND (id_devolucion IS NULL)) OR (((tipo)::text = 'refundAdjustment'::text) AND (puntos < 0) AND (id_devolucion IS NOT NULL)) OR (((tipo)::text = 'redeem'::text) AND (puntos < 0) AND (id_devolucion IS NULL)) OR (((tipo)::text = 'redemptionReturn'::text) AND (puntos > 0) AND (id_devolucion IS NULL)))",
)
export class PointsMovement {
  @Column({ name: 'id_cliente', type: 'uuid', nullable: false })
  id_cliente!: string;
  @Column({
    name: 'tipo',
    type: 'character varying',
    nullable: false,
    length: 24,
  })
  tipo!: string;
  @Column({ name: 'id_canje', type: 'uuid', nullable: true })
  id_canje!: string | null;
  @Column({ name: 'puntos', type: 'bigint', nullable: false })
  puntos!: string;
  @Column({ name: 'id_devolucion', type: 'uuid', nullable: true })
  id_devolucion!: string | null;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_movimiento',
    primaryKeyConstraintName: 'movimiento_puntos_pkey',
  })
  id_movimiento!: string;
  @Column({ name: 'id_acumulacion', type: 'uuid', nullable: true })
  id_acumulacion!: string | null;
  @Column({
    name: 'creado_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creado_en!: Date;
  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'movimiento_puntos_id_cliente_fkey',
    },
  ])
  client?: Relation<Client>;
  @ManyToOne(() => PointsAccrual, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_acumulacion',
      referencedColumnName: 'id_acumulacion',
      foreignKeyConstraintName: 'movimiento_puntos_id_acumulacion_fkey',
    },
  ])
  pointsAccrual?: Relation<PointsAccrual>;
  @ManyToOne(() => Refund, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_devolucion',
      referencedColumnName: 'id_devolucion',
      foreignKeyConstraintName: 'movimiento_puntos_id_devolucion_fkey',
    },
  ])
  refund?: Relation<Refund>;
  @ManyToOne(() => RedemptionRequest, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_canje',
      referencedColumnName: 'id_canje',
      foreignKeyConstraintName: 'movimiento_puntos_id_canje_fkey',
    },
  ])
  redemption?: Relation<RedemptionRequest>;
}
