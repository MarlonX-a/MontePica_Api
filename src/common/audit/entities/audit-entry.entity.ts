import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { GuestSession } from '../../../guest-sessions/entities/guest-session.entity.js';
import { User } from '../../../users/entities/user.entity.js';

@Entity('auditoria')
@Index(
  'ix_auditoria_recurso_fecha',
  ['ocurrido_en', 'recurso_id', 'recurso_tipo'],
  { unique: false },
)
export class AuditEntry {
  @Column({
    name: 'detalle',
    type: 'jsonb',
    nullable: false,
    default: () => "'{}'",
  })
  detalle!: Record<string, unknown>;
  @Column({ name: 'actor_sesion_cliente_id', type: 'uuid', nullable: true })
  actor_sesion_cliente_id!: string | null;
  @Column({
    name: 'actor_tipo',
    type: 'character varying',
    nullable: false,
    length: 20,
  })
  actor_tipo!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_evento',
    primaryKeyConstraintName: 'pk_auditoria',
  })
  id_evento!: string;
  @Column({
    name: 'recurso_tipo',
    type: 'character varying',
    nullable: false,
    length: 40,
  })
  recurso_tipo!: string;
  @Column({
    name: 'evento',
    type: 'character varying',
    nullable: false,
    length: 80,
  })
  evento!: string;
  @Column({
    name: 'ocurrido_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  ocurrido_en!: Date;
  @Column({ name: 'recurso_id', type: 'uuid', nullable: true })
  recurso_id!: string | null;
  @Column({ name: 'actor_usuario_id', type: 'uuid', nullable: true })
  actor_usuario_id!: string | null;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_auditoria_actor_usuario',
    },
  ])
  user?: Relation<User>;
  @ManyToOne(() => GuestSession, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_sesion_cliente_id',
      referencedColumnName: 'id_sesion_cliente',
      foreignKeyConstraintName: 'auditoria_actor_sesion_cliente_id_fkey',
    },
  ])
  guestSession?: Relation<GuestSession>;
}
