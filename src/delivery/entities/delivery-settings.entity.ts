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

@Entity('config_domicilio')
@Unique('config_domicilio_version_key', ['version'])
@Check('config_domicilio_version_check', '(version > 0)')
@Check(
  'config_domicilio_tarifa_ctvs_check',
  "((tarifa_ctvs >= 0) AND (tarifa_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'config_domicilio_comprobante_plazo_seg_check',
  '((comprobante_plazo_seg >= 60) AND (comprobante_plazo_seg <= 86400))',
)
export class DeliverySettings {
  @Column({
    name: 'cobertura',
    type: 'character varying',
    nullable: false,
    length: 500,
  })
  cobertura!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_configuracion',
    primaryKeyConstraintName: 'config_domicilio_pkey',
  })
  id_configuracion!: string;
  @Column({
    name: 'habilitado',
    type: 'boolean',
    nullable: false,
    default: () => 'false',
  })
  habilitado!: boolean;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({
    name: 'comprobante_plazo_seg',
    type: 'integer',
    nullable: false,
    default: () => "'900'",
  })
  comprobante_plazo_seg!: number;
  @Column({ name: 'configurada_por', type: 'uuid', nullable: true })
  configurada_por!: string | null;
  @Column({ name: 'tarifa_ctvs', type: 'bigint', nullable: false })
  tarifa_ctvs!: string;
  @Column({ name: 'version', type: 'integer', nullable: false })
  version!: number;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'configurada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'config_domicilio_configurada_por_fkey',
    },
  ])
  user?: Relation<User>;
}
