import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity('configuracion_operativa')
@Check('ck_configuracion_operativa_singleton', '(id_configuracion = 1)')
@Check(
  'configuracion_operativa_edicion_local_seg_check',
  '((edicion_local_seg >= 0) AND (edicion_local_seg <= 3600))',
)
export class OperationsSettings {
  @Column({
    name: 'zona_horaria',
    type: 'character varying',
    nullable: false,
    length: 80,
    default: () => "'America/Guayaquil'",
  })
  zona_horaria!: string;
  @Column({
    name: 'actualizada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  actualizada_en!: Date;
  @Column({ name: 'actualizada_por', type: 'uuid', nullable: true })
  actualizada_por!: string | null;
  @Column({
    name: 'hora_cierre',
    type: 'time without time zone',
    nullable: false,
    default: () => "'22:00:00'",
  })
  hora_cierre!: string;
  @PrimaryColumn({
    name: 'id_configuracion',
    type: 'smallint',
    nullable: false,
    primaryKeyConstraintName: 'pk_configuracion_operativa',
    default: () => "'1'",
  })
  id_configuracion!: number;
  @Column({
    name: 'hora_apertura',
    type: 'time without time zone',
    nullable: false,
    default: () => "'09:00:00'",
  })
  hora_apertura!: string;
  @Column({
    name: 'edicion_local_seg',
    type: 'integer',
    nullable: false,
    default: () => "'300'",
  })
  edicion_local_seg!: number;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'actualizada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_configuracion_operativa_usuario',
    },
  ])
  user?: Relation<User>;
}
