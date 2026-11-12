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

@Entity('configuracion_puntos')
@Unique('configuracion_puntos_version_key', ['version'])
@Check('configuracion_puntos_version_check', '(version > 0)')
@Check(
  'configuracion_puntos_tasa_por_dolar_check',
  '((tasa_por_dolar >= 1) AND (tasa_por_dolar <= 1000))',
)
export class PointsSettings {
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_configuracion',
    primaryKeyConstraintName: 'configuracion_puntos_pkey',
  })
  id_configuracion!: string;
  @Column({ name: 'tasa_por_dolar', type: 'integer', nullable: false })
  tasa_por_dolar!: number;
  @Column({ name: 'habilitado', type: 'boolean', nullable: false })
  habilitado!: boolean;
  @Column({ name: 'version', type: 'integer', nullable: false })
  version!: number;
  @Column({ name: 'configurada_por', type: 'uuid', nullable: true })
  configurada_por!: string | null;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'configurada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'configuracion_puntos_configurada_por_fkey',
    },
  ])
  user?: Relation<User>;
}
