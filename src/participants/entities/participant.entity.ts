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
import { Client } from '../../common/identity/entities/client.entity.js';
import { GuestSession } from '../../guest-sessions/entities/guest-session.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { TableVisit } from '../../visits/entities/table-visit.entity.js';

@Entity('participante')
@Unique('uq_participante_visita_cliente', ['id_cliente', 'id_visita'])
@Index('uq_participante_cliente_activo', ['id_cliente'], {
  unique: true,
  where: "((estado)::text = 'approved'::text)",
})
@Index(
  'ix_participante_visita_estado',
  ['estado', 'id_visita', 'solicitada_en'],
  { unique: false },
)
@Check(
  'ck_participante_estado',
  "((estado)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'finished'::character varying])::text[]))",
)
@Check(
  'ck_participante_version',
  '((qr_version_aprobada IS NULL) OR (qr_version_aprobada >= 1))',
)
export class Participant {
  @Column({ name: 'aprobada_por', type: 'uuid', nullable: true })
  aprobada_por!: string | null;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'pending'",
  })
  estado!: string;
  @Column({
    name: 'alias',
    type: 'character varying',
    nullable: false,
    length: 80,
  })
  alias!: string;
  @Column({ name: 'qr_version_aprobada', type: 'integer', nullable: true })
  qr_version_aprobada!: number | null;
  @Column({ name: 'id_cliente', type: 'uuid', nullable: false })
  id_cliente!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_participante',
    primaryKeyConstraintName: 'pk_participante',
  })
  id_participante!: string;
  @Column({ name: 'sesion_origen_id', type: 'uuid', nullable: true })
  sesion_origen_id!: string | null;
  @Column({ name: 'id_visita', type: 'uuid', nullable: false })
  id_visita!: string;
  @Column({
    name: 'finalizada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  finalizada_en!: Date | null;
  @Column({
    name: 'solicitada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  solicitada_en!: Date;
  @Column({
    name: 'aprobada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  aprobada_en!: Date | null;
  @Column({ name: 'solicitada_desde', type: 'uuid', nullable: true })
  solicitada_desde!: string | null;
  @Column({
    name: 'motivo_rechazo',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  motivo_rechazo!: string | null;
  @ManyToOne(() => TableVisit, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_visita',
      referencedColumnName: 'id_visita',
      foreignKeyConstraintName: 'fk_participante_visita',
    },
  ])
  visit?: Relation<TableVisit>;
  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_participante_cliente',
    },
  ])
  client?: Relation<Client>;
  @ManyToOne(() => GuestSession, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'sesion_origen_id',
      referencedColumnName: 'id_sesion_cliente',
      foreignKeyConstraintName: 'fk_participante_sesion',
    },
  ])
  guestSession?: Relation<GuestSession>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'solicitada_desde',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_participante_solicitada_desde',
    },
  ])
  user?: Relation<User>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'aprobada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_participante_aprobada_por',
    },
  ])
  userRelation?: Relation<User>;
}
