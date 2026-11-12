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
import { Client } from '../../common/identity/entities/client.entity.js';
import { OperatingDay } from '../../operations/entities/operating-day.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { DeliverySettings } from './delivery-settings.entity.js';

@Entity('solicitud_domicilio')
@Index(
  'ix_solicitud_domicilio_cliente_fecha',
  ['creada_en', 'id_cliente', 'id_solicitud'],
  { unique: false },
)
@Check(
  'solicitud_domicilio_destinatario_check',
  '(length(TRIM(BOTH FROM destinatario)) > 0)',
)
@Check(
  'solicitud_domicilio_telefono_check',
  '(length(TRIM(BOTH FROM telefono)) > 0)',
)
@Check(
  'solicitud_domicilio_direccion_check',
  '(length(TRIM(BOTH FROM direccion)) > 0)',
)
@Check(
  'solicitud_domicilio_tarifa_ctvs_check',
  "((tarifa_ctvs >= 0) AND (tarifa_ctvs <= '9007199254740991'::bigint))",
)
@Check(
  'solicitud_domicilio_estado_check',
  "((estado)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[]))",
)
@Check(
  'solicitud_domicilio_check',
  "(((latitud IS NULL) AND (longitud IS NULL)) OR ((latitud IS NOT NULL) AND (longitud IS NOT NULL) AND ((latitud >= ('-90'::integer)::double precision) AND (latitud <= (90)::double precision)) AND ((longitud >= ('-180'::integer)::double precision) AND (longitud <= (180)::double precision))))",
)
export class DeliveryRequest {
  @Column({
    name: 'telefono',
    type: 'character varying',
    nullable: false,
    length: 20,
  })
  telefono!: string;
  @Column({
    name: 'referencias',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  referencias!: string | null;
  @Column({ name: 'id_jornada', type: 'uuid', nullable: false })
  id_jornada!: string;
  @Column({
    name: 'decidida_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  decidida_en!: Date | null;
  @Column({ name: 'latitud', type: 'double precision', nullable: true })
  latitud!: number | null;
  @Column({
    name: 'direccion',
    type: 'character varying',
    nullable: false,
    length: 500,
  })
  direccion!: string;
  @Column({
    name: 'motivo_rechazo',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  motivo_rechazo!: string | null;
  @Column({ name: 'id_configuracion', type: 'uuid', nullable: false })
  id_configuracion!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_solicitud',
    primaryKeyConstraintName: 'solicitud_domicilio_pkey',
  })
  id_solicitud!: string;
  @Column({ name: 'tarifa_ctvs', type: 'bigint', nullable: false })
  tarifa_ctvs!: string;
  @Column({
    name: 'cancelada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  cancelada_en!: Date | null;
  @Column({ name: 'longitud', type: 'double precision', nullable: true })
  longitud!: number | null;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'pending'",
  })
  estado!: string;
  @Column({ name: 'id_cliente', type: 'uuid', nullable: false })
  id_cliente!: string;
  @Column({ name: 'decidida_por', type: 'uuid', nullable: true })
  decidida_por!: string | null;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({
    name: 'destinatario',
    type: 'character varying',
    nullable: false,
    length: 160,
  })
  destinatario!: string;
  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'solicitud_domicilio_id_cliente_fkey',
    },
  ])
  client?: Relation<Client>;
  @ManyToOne(() => OperatingDay, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_jornada',
      referencedColumnName: 'id_jornada',
      foreignKeyConstraintName: 'solicitud_domicilio_id_jornada_fkey',
    },
  ])
  operatingDay?: Relation<OperatingDay>;
  @ManyToOne(() => DeliverySettings, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_configuracion',
      referencedColumnName: 'id_configuracion',
      foreignKeyConstraintName: 'solicitud_domicilio_id_configuracion_fkey',
    },
  ])
  configuration?: Relation<DeliverySettings>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'decidida_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'solicitud_domicilio_decidida_por_fkey',
    },
  ])
  user?: Relation<User>;
}
