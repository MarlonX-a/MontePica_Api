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
import { User } from '../../users/entities/user.entity.js';

@Entity('jornada_operativa')
@Unique('uq_jornada_operativa_fecha', ['fecha_operativa'])
@Check(
  'ck_jornada_operativa_estado',
  "((estado)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying])::text[]))",
)
export class OperatingDay {
  @Column({ name: 'fecha_operativa', type: 'date', nullable: false })
  fecha_operativa!: string;
  @Column({ name: 'abierta_por', type: 'uuid', nullable: false })
  abierta_por!: string;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'open'",
  })
  estado!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_jornada',
    primaryKeyConstraintName: 'pk_jornada_operativa',
  })
  id_jornada!: string;
  @Column({
    name: 'abierta_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  abierta_en!: Date;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'abierta_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_jornada_operativa_usuario',
    },
  ])
  user?: Relation<User>;
}
