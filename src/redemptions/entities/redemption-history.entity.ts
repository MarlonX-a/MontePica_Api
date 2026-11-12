import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { RedemptionRequest } from './redemption-request.entity.js';

@Entity('historial_canje')
export class RedemptionHistory {
  @Column({
    name: 'detalle',
    type: 'jsonb',
    nullable: false,
    default: () => "'{}'",
  })
  detalle!: Record<string, unknown>;
  @Column({ name: 'id_canje', type: 'uuid', nullable: false })
  id_canje!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_historial',
    primaryKeyConstraintName: 'historial_canje_pkey',
  })
  id_historial!: string;
  @Column({
    name: 'evento',
    type: 'character varying',
    nullable: false,
    length: 32,
  })
  evento!: string;
  @Column({ name: 'actor_usuario', type: 'uuid', nullable: true })
  actor_usuario!: string | null;
  @Column({
    name: 'ocurrido_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  ocurrido_en!: Date;
  @ManyToOne(() => RedemptionRequest, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_canje',
      referencedColumnName: 'id_canje',
      foreignKeyConstraintName: 'historial_canje_id_canje_fkey',
    },
  ])
  redemption?: Relation<RedemptionRequest>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'historial_canje_actor_usuario_fkey',
    },
  ])
  actorUser?: Relation<User>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actor_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_historial_canje_usuario',
    },
  ])
  actorUserRelation?: Relation<User>;
}
