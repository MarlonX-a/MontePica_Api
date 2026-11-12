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
import { CancellationRequest } from './cancellation-request.entity.js';

@Entity('historial_cancelacion')
@Check(
  'historial_cancelacion_check',
  '(num_nonnulls(actor_usuario, actor_sesion_cliente) = 1)',
)
export class CancellationHistory {
  @Column({ name: 'id_solicitud', type: 'uuid', nullable: false })
  id_solicitud!: string;
  @Column({
    name: 'evento',
    type: 'character varying',
    nullable: false,
    length: 40,
  })
  evento!: string;
  @Column({
    name: 'ocurrido_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  ocurrido_en!: Date;
  @Column({ name: 'actor_sesion_cliente', type: 'uuid', nullable: true })
  actor_sesion_cliente!: string | null;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_historial',
    primaryKeyConstraintName: 'historial_cancelacion_pkey',
  })
  id_historial!: string;
  @Column({ name: 'actor_usuario', type: 'uuid', nullable: true })
  actor_usuario!: string | null;
  @ManyToOne(() => CancellationRequest, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_solicitud',
      referencedColumnName: 'id_solicitud',
      foreignKeyConstraintName: 'historial_cancelacion_id_solicitud_fkey',
    },
  ])
  request?: Relation<CancellationRequest>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'historial_cancelacion_actor_usuario_fkey',
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
        'historial_cancelacion_actor_sesion_cliente_fkey',
    },
  ])
  actorGuestSession?: Relation<GuestSession>;
}
