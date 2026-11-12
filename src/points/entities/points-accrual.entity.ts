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
import { Client } from '../../common/identity/entities/client.entity.js';
import { Payment } from '../../payments/entities/payment.entity.js';
import { PointsSettings } from './points-settings.entity.js';

@Entity('acumulacion_puntos')
@Unique('acumulacion_puntos_id_pago_key', ['id_pago'])
@Check('acumulacion_puntos_productos_ctvs_check', '(productos_ctvs >= 0)')
@Check(
  'acumulacion_puntos_puntos_check',
  "((puntos >= 0) AND (puntos <= '9007199254740991'::bigint))",
)
@Check(
  'acumulacion_puntos_estado_check',
  "((estado)::text = ANY ((ARRAY['pending'::character varying, 'credited'::character varying, 'cancelled'::character varying])::text[]))",
)
export class PointsAccrual {
  @Column({
    name: 'acreditada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  acreditada_en!: Date | null;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
  })
  estado!: string;
  @Column({ name: 'id_cliente', type: 'uuid', nullable: false })
  id_cliente!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_acumulacion',
    primaryKeyConstraintName: 'acumulacion_puntos_pkey',
  })
  id_acumulacion!: string;
  @Column({ name: 'id_configuracion', type: 'uuid', nullable: false })
  id_configuracion!: string;
  @Column({ name: 'puntos', type: 'bigint', nullable: false })
  puntos!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({ name: 'productos_ctvs', type: 'bigint', nullable: false })
  productos_ctvs!: string;
  @Column({ name: 'id_pago', type: 'uuid', nullable: false })
  id_pago!: string;
  @ManyToOne(() => Payment, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pago',
      referencedColumnName: 'id_pago',
      foreignKeyConstraintName: 'acumulacion_puntos_id_pago_fkey',
    },
  ])
  payment?: Relation<Payment>;
  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'acumulacion_puntos_id_cliente_fkey',
    },
  ])
  client?: Relation<Client>;
  @ManyToOne(() => PointsSettings, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_configuracion',
      referencedColumnName: 'id_configuracion',
      foreignKeyConstraintName: 'acumulacion_puntos_id_configuracion_fkey',
    },
  ])
  configuration?: Relation<PointsSettings>;
}
