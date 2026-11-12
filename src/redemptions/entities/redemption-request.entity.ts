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
import { ConsumptionAccount } from '../../accounts/entities/consumption-account.entity.js';
import { Product } from '../../catalog/entities/product.entity.js';
import { Client } from '../../common/identity/entities/client.entity.js';
import { OperatingDay } from '../../operations/entities/operating-day.entity.js';
import { Order } from '../../orders/entities/order.entity.js';
import { Participant } from '../../participants/entities/participant.entity.js';
import { Reward } from '../../rewards/entities/reward.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { TableVisit } from '../../visits/entities/table-visit.entity.js';

@Entity('solicitud_canje')
@Unique('solicitud_canje_id_pedido_key', ['id_pedido'])
@Index('ix_solicitud_canje_expiry', ['expira_en', 'id_canje'], {
  unique: false,
  where: "((estado)::text = 'pending'::text)",
})
@Index('ix_solicitud_canje_client', ['creada_en', 'id_canje', 'id_cliente'], {
  unique: false,
})
@Check('solicitud_canje_version_recompensa_check', '(version_recompensa > 0)')
@Check(
  'solicitud_canje_costo_puntos_check',
  "((costo_puntos >= 1) AND (costo_puntos <= '9007199254740991'::bigint))",
)
@Check(
  'solicitud_canje_estado_check',
  "((estado)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[]))",
)
@Check(
  'solicitud_canje_check',
  "(((estado)::text = 'approved'::text) = (id_pedido IS NOT NULL))",
)
export class RedemptionRequest {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_canje',
    primaryKeyConstraintName: 'solicitud_canje_pkey',
  })
  id_canje!: string;
  @Column({ name: 'creado_por', type: 'uuid', nullable: true })
  creado_por!: string | null;
  @Column({ name: 'id_cuenta', type: 'uuid', nullable: false })
  id_cuenta!: string;
  @Column({ name: 'id_producto', type: 'uuid', nullable: false })
  id_producto!: string;
  @Column({ name: 'id_recompensa', type: 'uuid', nullable: false })
  id_recompensa!: string;
  @Column({ name: 'id_participante', type: 'uuid', nullable: false })
  id_participante!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({ name: 'version_recompensa', type: 'integer', nullable: false })
  version_recompensa!: number;
  @Column({ name: 'id_jornada', type: 'uuid', nullable: false })
  id_jornada!: string;
  @Column({
    name: 'expira_en',
    type: 'timestamp with time zone',
    nullable: false,
  })
  expira_en!: Date;
  @Column({ name: 'id_visita', type: 'uuid', nullable: false })
  id_visita!: string;
  @Column({
    name: 'resuelta_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  resuelta_en!: Date | null;
  @Column({
    name: 'motivo',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  motivo!: string | null;
  @Column({ name: 'id_pedido', type: 'uuid', nullable: true })
  id_pedido!: string | null;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'pending'",
  })
  estado!: string;
  @Column({ name: 'controla_stock', type: 'boolean', nullable: false })
  controla_stock!: boolean;
  @Column({ name: 'id_cliente', type: 'uuid', nullable: false })
  id_cliente!: string;
  @Column({ name: 'costo_puntos', type: 'bigint', nullable: false })
  costo_puntos!: string;
  @Column({ name: 'resuelto_por', type: 'uuid', nullable: true })
  resuelto_por!: string | null;
  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'solicitud_canje_id_cliente_fkey',
    },
  ])
  client?: Relation<Client>;
  @ManyToOne(() => Participant, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_participante',
      referencedColumnName: 'id_participante',
      foreignKeyConstraintName: 'solicitud_canje_id_participante_fkey',
    },
  ])
  participant?: Relation<Participant>;
  @ManyToOne(() => ConsumptionAccount, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cuenta',
      referencedColumnName: 'id_cuenta',
      foreignKeyConstraintName: 'solicitud_canje_id_cuenta_fkey',
    },
  ])
  account?: Relation<ConsumptionAccount>;
  @ManyToOne(() => TableVisit, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_visita',
      referencedColumnName: 'id_visita',
      foreignKeyConstraintName: 'solicitud_canje_id_visita_fkey',
    },
  ])
  visit?: Relation<TableVisit>;
  @ManyToOne(() => OperatingDay, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_jornada',
      referencedColumnName: 'id_jornada',
      foreignKeyConstraintName: 'solicitud_canje_id_jornada_fkey',
    },
  ])
  operatingDay?: Relation<OperatingDay>;
  @ManyToOne(() => Reward, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_recompensa',
      referencedColumnName: 'id_recompensa',
      foreignKeyConstraintName: 'solicitud_canje_id_recompensa_fkey',
    },
  ])
  reward?: Relation<Reward>;
  @ManyToOne(() => Product, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_producto',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'solicitud_canje_id_producto_fkey',
    },
  ])
  product?: Relation<Product>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'creado_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'solicitud_canje_creado_por_fkey',
    },
  ])
  createdBy?: Relation<User>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'resuelto_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'solicitud_canje_resuelto_por_fkey',
    },
  ])
  user?: Relation<User>;
  @ManyToOne(() => Order, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pedido',
      referencedColumnName: 'id_pedido',
      foreignKeyConstraintName: 'solicitud_canje_id_pedido_fkey',
    },
  ])
  order?: Relation<Order>;
}
