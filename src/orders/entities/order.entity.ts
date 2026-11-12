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
import { ConsumptionAccount } from '../../accounts/entities/consumption-account.entity.js';
import { GuestSession } from '../../guest-sessions/entities/guest-session.entity.js';
import { OperatingDay } from '../../operations/entities/operating-day.entity.js';
import { RedemptionRequest } from '../../redemptions/entities/redemption-request.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { TableVisit } from '../../visits/entities/table-visit.entity.js';

@Entity('pedido')
@Unique('pedido_id_canje_key', ['id_canje'])
@Check(
  'pedido_check',
  '(num_nonnulls(actor_usuario, actor_sesion_cliente) = 1)',
)
@Check(
  'pedido_modalidad_check',
  "((((modalidad)::text = 'local'::text) AND (id_visita IS NOT NULL)) OR (((modalidad)::text = 'delivery'::text) AND (id_visita IS NULL)))",
)
@Check(
  'pedido_estado_check',
  "((estado)::text = ANY ((ARRAY['submitted'::character varying, 'preparing'::character varying, 'ready'::character varying, 'dispatched'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::text[]))",
)
@Check(
  'ck_despacho_domicilio',
  "(((estado)::text <> 'dispatched'::text) OR ((modalidad)::text = 'delivery'::text))",
)
@Check(
  'pedido_origen_check',
  "((origen)::text = ANY ((ARRAY['client'::character varying, 'reward'::character varying])::text[]))",
)
@Check(
  'ck_pedido_origen_canje',
  "(((origen)::text = 'reward'::text) = (id_canje IS NOT NULL))",
)
@Check(
  'ck_pedido_reward_local',
  "(((origen)::text <> 'reward'::text) OR (((modalidad)::text = 'local'::text) AND (id_visita IS NOT NULL) AND (actor_sesion_cliente IS NULL)))",
)
export class Order {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_pedido',
    primaryKeyConstraintName: 'pedido_pkey',
  })
  id_pedido!: string;
  @Column({ name: 'id_cuenta', type: 'uuid', nullable: false })
  id_cuenta!: string;
  @Column({
    name: 'modalidad',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'local'",
  })
  modalidad!: string;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 20,
    default: () => "'submitted'",
  })
  estado!: string;
  @Column({ name: 'id_visita', type: 'uuid', nullable: true })
  id_visita!: string | null;
  @Column({
    name: 'origen',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'client'",
  })
  origen!: string;
  @Column({ name: 'actor_sesion_cliente', type: 'uuid', nullable: true })
  actor_sesion_cliente!: string | null;
  @Column({ name: 'actor_usuario', type: 'uuid', nullable: true })
  actor_usuario!: string | null;
  @Column({ name: 'id_jornada', type: 'uuid', nullable: false })
  id_jornada!: string;
  @Column({
    name: 'enviado_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  enviado_en!: Date;
  @Column({ name: 'id_canje', type: 'uuid', nullable: true })
  id_canje!: string | null;
  @Column({
    name: 'editable_hasta',
    type: 'timestamp with time zone',
    nullable: true,
  })
  editable_hasta!: Date | null;
  @ManyToOne(() => OperatingDay, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_jornada',
      referencedColumnName: 'id_jornada',
      foreignKeyConstraintName: 'pedido_id_jornada_fkey',
    },
  ])
  operatingDay?: Relation<OperatingDay>;
  @ManyToOne(() => TableVisit, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_visita',
      referencedColumnName: 'id_visita',
      foreignKeyConstraintName: 'pedido_id_visita_fkey',
    },
  ])
  visit?: Relation<TableVisit>;
  @ManyToOne(() => ConsumptionAccount, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cuenta',
      referencedColumnName: 'id_cuenta',
      foreignKeyConstraintName: 'pedido_id_cuenta_fkey',
    },
  ])
  account?: Relation<ConsumptionAccount>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'pedido_actor_usuario_fkey',
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
      foreignKeyConstraintName: 'pedido_actor_sesion_cliente_fkey',
    },
  ])
  actorGuestSession?: Relation<GuestSession>;
  @ManyToOne(() => RedemptionRequest, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_canje',
      referencedColumnName: 'id_canje',
      foreignKeyConstraintName: 'pedido_id_canje_fkey',
    },
  ])
  redemption?: Relation<RedemptionRequest>;
}
