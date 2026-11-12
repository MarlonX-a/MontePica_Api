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
import { GuestSession } from '../../guest-sessions/entities/guest-session.entity.js';
import { OrderVersion } from '../../orders/entities/order-version.entity.js';
import { Order } from '../../orders/entities/order.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('solicitud_cancelacion')
@Index('uq_cancelacion_pendiente_pedido', ['id_pedido'], {
  unique: true,
  where: "((estado)::text = 'pending'::text)",
})
@Check(
  'solicitud_cancelacion_estado_check',
  "((estado)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'withdrawn'::character varying])::text[]))",
)
@Check(
  'solicitud_cancelacion_motivo_check',
  '((length(TRIM(BOTH FROM motivo)) >= 1) AND (length(TRIM(BOTH FROM motivo)) <= 500))',
)
@Check(
  'solicitud_cancelacion_check',
  '(num_nonnulls(actor_usuario, actor_sesion_cliente) = 1)',
)
export class CancellationRequest {
  @Column({ name: 'id_pedido', type: 'uuid', nullable: false })
  id_pedido!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({
    name: 'decidida_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  decidida_en!: Date | null;
  @Column({ name: 'decidida_por', type: 'uuid', nullable: true })
  decidida_por!: string | null;
  @Column({
    name: 'solicitada_cliente',
    type: 'boolean',
    nullable: false,
    default: () => 'false',
  })
  solicitada_cliente!: boolean;
  @Column({
    name: 'motivo_rechazo',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  motivo_rechazo!: string | null;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 20,
    default: () => "'pending'",
  })
  estado!: string;
  @Column({ name: 'actor_usuario', type: 'uuid', nullable: true })
  actor_usuario!: string | null;
  @Column({
    name: 'motivo',
    type: 'character varying',
    nullable: false,
    length: 500,
  })
  motivo!: string;
  @Column({ name: 'actor_sesion_cliente', type: 'uuid', nullable: true })
  actor_sesion_cliente!: string | null;
  @Column({ name: 'id_version', type: 'uuid', nullable: false })
  id_version!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_solicitud',
    primaryKeyConstraintName: 'solicitud_cancelacion_pkey',
  })
  id_solicitud!: string;
  @Column({
    name: 'estado_pedido',
    type: 'character varying',
    nullable: false,
    length: 20,
  })
  estado_pedido!: string;
  @ManyToOne(() => Order, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pedido',
      referencedColumnName: 'id_pedido',
      foreignKeyConstraintName: 'solicitud_cancelacion_id_pedido_fkey',
    },
  ])
  order?: Relation<Order>;
  @ManyToOne(() => OrderVersion, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_version',
      referencedColumnName: 'id_version',
      foreignKeyConstraintName: 'solicitud_cancelacion_id_version_fkey',
    },
  ])
  orderVersion?: Relation<OrderVersion>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'solicitud_cancelacion_actor_usuario_fkey',
    },
  ])
  actorUser?: Relation<User>;
  @ManyToOne(() => GuestSession, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_sesion_cliente',
      referencedColumnName: 'id_sesion_cliente',
      foreignKeyConstraintName:
        'solicitud_cancelacion_actor_sesion_cliente_fkey',
    },
  ])
  actorGuestSession?: Relation<GuestSession>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'decidida_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'solicitud_cancelacion_decidida_por_fkey',
    },
  ])
  user?: Relation<User>;
}
