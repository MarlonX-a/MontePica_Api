import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { GuestSession } from '../../guest-sessions/entities/guest-session.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { OrderVersion } from './order-version.entity.js';
import { Order } from './order.entity.js';

@Entity('historial_pedido')
export class OrderHistory {
  @Column({
    name: 'motivo',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  motivo!: string | null;
  @Column({ name: 'id_pedido', type: 'uuid', nullable: false })
  id_pedido!: string;
  @Column({
    name: 'ocurrido_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  ocurrido_en!: Date;
  @Column({ name: 'actor_sesion_cliente', type: 'uuid', nullable: true })
  actor_sesion_cliente!: string | null;
  @Column({
    name: 'estado_anterior',
    type: 'character varying',
    nullable: true,
    length: 20,
  })
  estado_anterior!: string | null;
  @Column({
    name: 'actor_tipo',
    type: 'character varying',
    nullable: false,
    length: 20,
  })
  actor_tipo!: string;
  @Column({ name: 'actor_usuario', type: 'uuid', nullable: true })
  actor_usuario!: string | null;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_historial',
    primaryKeyConstraintName: 'historial_pedido_pkey',
  })
  id_historial!: string;
  @Column({ name: 'id_version', type: 'uuid', nullable: true })
  id_version!: string | null;
  @Column({
    name: 'evento',
    type: 'character varying',
    nullable: false,
    length: 40,
  })
  evento!: string;
  @Column({
    name: 'estado_nuevo',
    type: 'character varying',
    nullable: false,
    length: 20,
  })
  estado_nuevo!: string;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'historial_pedido_actor_usuario_fkey',
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
      foreignKeyConstraintName: 'historial_pedido_actor_sesion_cliente_fkey',
    },
  ])
  actorGuestSession?: Relation<GuestSession>;
  @ManyToOne(() => Order, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pedido',
      referencedColumnName: 'id_pedido',
      foreignKeyConstraintName: 'historial_pedido_id_pedido_fkey',
    },
  ])
  order?: Relation<Order>;
  @ManyToOne(() => OrderVersion, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_version',
      referencedColumnName: 'id_version',
      foreignKeyConstraintName: 'historial_pedido_id_version_fkey',
    },
  ])
  orderVersion?: Relation<OrderVersion>;
}
