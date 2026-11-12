import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Refund } from './refund.entity.js';

@Entity('historial_devolucion')
export class RefundHistory {
  @Column({
    name: 'ocurrido_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  ocurrido_en!: Date;
  @Column({ name: 'id_devolucion', type: 'uuid', nullable: false })
  id_devolucion!: string;
  @Column({ name: 'actor_usuario', type: 'uuid', nullable: false })
  actor_usuario!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_historial',
    primaryKeyConstraintName: 'historial_devolucion_pkey',
  })
  id_historial!: string;
  @Column({
    name: 'evento',
    type: 'character varying',
    nullable: false,
    length: 40,
  })
  evento!: string;
  @Column({
    name: 'detalle',
    type: 'jsonb',
    nullable: false,
    default: () => "'{}'",
  })
  detalle!: Record<string, unknown>;
  @ManyToOne(() => Refund, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_devolucion',
      referencedColumnName: 'id_devolucion',
      foreignKeyConstraintName: 'historial_devolucion_id_devolucion_fkey',
    },
  ])
  refund?: Relation<Refund>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'historial_devolucion_actor_usuario_fkey',
    },
  ])
  actorUser?: Relation<User>;
}
