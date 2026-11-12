import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { GuestSession } from '../../guest-sessions/entities/guest-session.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Payment } from './payment.entity.js';

@Entity('historial_pago')
@Check(
  'ck_historial_pago_actor',
  '(num_nonnulls(actor_usuario, actor_sesion_cliente) = 1)',
)
export class PaymentHistory {
  @Column({
    name: 'ocurrido_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  ocurrido_en!: Date;
  @Column({ name: 'actor_usuario', type: 'uuid', nullable: true })
  actor_usuario!: string | null;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_historial_pago',
    primaryKeyConstraintName: 'historial_pago_pkey',
  })
  id_historial_pago!: string;
  @Column({
    name: 'estado_anterior',
    type: 'character varying',
    nullable: true,
    length: 32,
  })
  estado_anterior!: string | null;
  @Column({
    name: 'evento',
    type: 'character varying',
    nullable: false,
    length: 40,
  })
  evento!: string;
  @Column({ name: 'actor_sesion_cliente', type: 'uuid', nullable: true })
  actor_sesion_cliente!: string | null;
  @Column({
    name: 'estado_nuevo',
    type: 'character varying',
    nullable: false,
    length: 32,
  })
  estado_nuevo!: string;
  @Column({ name: 'id_pago', type: 'uuid', nullable: false })
  id_pago!: string;
  @ManyToOne(() => GuestSession, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_sesion_cliente',
      referencedColumnName: 'id_sesion_cliente',
      foreignKeyConstraintName: 'historial_pago_actor_sesion_cliente_fkey',
    },
  ])
  actorGuestSession?: Relation<GuestSession>;
  @ManyToOne(() => Payment, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pago',
      referencedColumnName: 'id_pago',
      foreignKeyConstraintName: 'historial_pago_id_pago_fkey',
    },
  ])
  payment?: Relation<Payment>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'historial_pago_actor_usuario_fkey',
    },
  ])
  actorUser?: Relation<User>;
}
