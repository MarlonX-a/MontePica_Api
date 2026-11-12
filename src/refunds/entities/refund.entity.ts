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
import { CancellationRequest } from '../../cancellations/entities/cancellation-request.entity.js';
import { CashRegister } from '../../cash/entities/cash-register.entity.js';
import { Order } from '../../orders/entities/order.entity.js';
import { Payment } from '../../payments/entities/payment.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('devolucion')
@Unique('devolucion_id_solicitud_key', ['id_solicitud'])
@Unique('devolucion_id_pago_key', ['id_pago'])
@Unique('devolucion_id_pedido_key', ['id_pedido'])
@Index('uq_devolucion_referencia_bancaria', ['referencia_bancaria'], {
  unique: true,
  where: '(referencia_bancaria IS NOT NULL)',
})
@Check(
  'devolucion_importe_ctvs_check',
  "((importe_ctvs > 0) AND (importe_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'devolucion_estado_check',
  "((estado)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying])::text[]))",
)
@Check(
  'ck_devolucion_ejecucion',
  "((((estado)::text = 'pending'::text) AND (metodo IS NULL) AND (ejecutada_por IS NULL) AND (ejecutada_en IS NULL) AND (referencia_bancaria IS NULL) AND (destinatario IS NULL) AND (observaciones IS NULL) AND (id_caja IS NULL)) OR (((estado)::text = 'completed'::text) AND ((metodo)::text = 'transfer'::text) AND (ejecutada_por IS NOT NULL) AND (ejecutada_en IS NOT NULL) AND (referencia_bancaria IS NOT NULL) AND ((length(TRIM(BOTH FROM referencia_bancaria)) >= 1) AND (length(TRIM(BOTH FROM referencia_bancaria)) <= 120)) AND (destinatario IS NULL) AND (id_caja IS NULL)) OR (((estado)::text = 'completed'::text) AND ((metodo)::text = 'cash'::text) AND (ejecutada_por IS NOT NULL) AND (ejecutada_en IS NOT NULL) AND (destinatario IS NOT NULL) AND ((length(TRIM(BOTH FROM destinatario)) >= 1) AND (length(TRIM(BOTH FROM destinatario)) <= 160)) AND (referencia_bancaria IS NULL) AND (id_caja IS NOT NULL)))",
)
export class Refund {
  @Column({ name: 'id_solicitud', type: 'uuid', nullable: false })
  id_solicitud!: string;
  @Column({
    name: 'referencia_bancaria',
    type: 'character varying',
    nullable: true,
    length: 120,
  })
  referencia_bancaria!: string | null;
  @Column({ name: 'ejecutada_por', type: 'uuid', nullable: true })
  ejecutada_por!: string | null;
  @Column({
    name: 'ejecutada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  ejecutada_en!: Date | null;
  @Column({ name: 'importe_ctvs', type: 'bigint', nullable: false })
  importe_ctvs!: string;
  @Column({
    name: 'destinatario',
    type: 'character varying',
    nullable: true,
    length: 160,
  })
  destinatario!: string | null;
  @Column({ name: 'id_caja', type: 'uuid', nullable: true })
  id_caja!: string | null;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 20,
    default: () => "'pending'",
  })
  estado!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({ name: 'autorizada_por', type: 'uuid', nullable: false })
  autorizada_por!: string;
  @Column({
    name: 'metodo',
    type: 'character varying',
    nullable: true,
    length: 16,
  })
  metodo!: string | null;
  @Column({
    name: 'observaciones',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  observaciones!: string | null;
  @Column({ name: 'id_pago', type: 'uuid', nullable: false })
  id_pago!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_devolucion',
    primaryKeyConstraintName: 'devolucion_pkey',
  })
  id_devolucion!: string;
  @Column({ name: 'id_pedido', type: 'uuid', nullable: false })
  id_pedido!: string;
  @ManyToOne(() => CancellationRequest, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_solicitud',
      referencedColumnName: 'id_solicitud',
      foreignKeyConstraintName: 'devolucion_id_solicitud_fkey',
    },
  ])
  request?: Relation<CancellationRequest>;
  @ManyToOne(() => Payment, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pago',
      referencedColumnName: 'id_pago',
      foreignKeyConstraintName: 'devolucion_id_pago_fkey',
    },
  ])
  payment?: Relation<Payment>;
  @ManyToOne(() => Order, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pedido',
      referencedColumnName: 'id_pedido',
      foreignKeyConstraintName: 'devolucion_id_pedido_fkey',
    },
  ])
  order?: Relation<Order>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'autorizada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'devolucion_autorizada_por_fkey',
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
      name: 'ejecutada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'devolucion_ejecutada_por_fkey',
    },
  ])
  userRelation?: Relation<User>;
  @ManyToOne(() => CashRegister, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_caja',
      referencedColumnName: 'id_caja',
      foreignKeyConstraintName: 'devolucion_id_caja_fkey',
    },
  ])
  cashRegister?: Relation<CashRegister>;
}
