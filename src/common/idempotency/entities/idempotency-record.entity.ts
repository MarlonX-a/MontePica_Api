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
import { GuestSession } from '../../../guest-sessions/entities/guest-session.entity.js';
import { User } from '../../../users/entities/user.entity.js';

@Entity('idempotencia')
@Index(
  'uq_idempotencia_usuario_op_key',
  ['actor_usuario_id', 'clave', 'operacion'],
  { unique: true, where: '(actor_usuario_id IS NOT NULL)' },
)
@Index(
  'uq_idempotencia_cliente_sesion_op_key',
  ['actor_sesion_cliente_id', 'clave', 'operacion'],
  { unique: true, where: '(actor_sesion_cliente_id IS NOT NULL)' },
)
@Index('ix_idempotencia_creada_en', ['creada_en'], { unique: false })
@Check(
  'ck_idempotencia_estado_http',
  '((estado_http >= 200) AND (estado_http <= 299))',
)
export class IdempotencyRecord {
  @Column({ name: 'respuesta', type: 'jsonb', nullable: false })
  respuesta!: Record<string, unknown>;
  @Column({
    name: 'solicitud_hash',
    type: 'character',
    nullable: false,
    length: 64,
  })
  solicitud_hash!: string;
  @Column({
    name: 'operacion',
    type: 'character varying',
    nullable: false,
    length: 160,
  })
  operacion!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_idempotencia',
    primaryKeyConstraintName: 'pk_idempotencia',
  })
  id_idempotencia!: string;
  @Column({
    name: 'actor_tipo',
    type: 'character varying',
    nullable: false,
    length: 20,
    default: () => "'usuario'",
  })
  actor_tipo!: string;
  @Column({ name: 'estado_http', type: 'smallint', nullable: false })
  estado_http!: number;
  @Column({
    name: 'recurso_tipo',
    type: 'character varying',
    nullable: false,
    length: 40,
  })
  recurso_tipo!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({ name: 'actor_usuario_id', type: 'uuid', nullable: true })
  actor_usuario_id!: string | null;
  @Column({ name: 'actor_sesion_cliente_id', type: 'uuid', nullable: true })
  actor_sesion_cliente_id!: string | null;
  @Column({ name: 'recurso_id', type: 'uuid', nullable: true })
  recurso_id!: string | null;
  @Column({
    name: 'clave',
    type: 'character varying',
    nullable: false,
    length: 128,
  })
  clave!: string;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_idempotencia_usuario',
    },
  ])
  user?: Relation<User>;
  @ManyToOne(() => GuestSession, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_sesion_cliente_id',
      referencedColumnName: 'id_sesion_cliente',
      foreignKeyConstraintName: 'idempotencia_actor_sesion_cliente_id_fkey',
    },
  ])
  guestSession?: Relation<GuestSession>;
}
