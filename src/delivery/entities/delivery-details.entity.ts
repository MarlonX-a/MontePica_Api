import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { DeliveryRequest } from './delivery-request.entity.js';

@Entity('entrega_domicilio')
@Unique('entrega_domicilio_id_solicitud_key', ['id_solicitud'])
@Check(
  'entrega_domicilio_tarifa_ctvs_check',
  "((tarifa_ctvs >= 0) AND (tarifa_ctvs <= '9007199254740991'::bigint))",
)
export class DeliveryDetails {
  @PrimaryColumn({
    name: 'id_pedido',
    type: 'uuid',
    nullable: false,
    primaryKeyConstraintName: 'entrega_domicilio_pkey',
  })
  id_pedido!: string;
  @Column({
    name: 'telefono',
    type: 'character varying',
    nullable: false,
    length: 20,
  })
  telefono!: string;
  @Column({ name: 'latitud', type: 'double precision', nullable: true })
  latitud!: number | null;
  @Column({ name: 'version_configuracion', type: 'integer', nullable: false })
  version_configuracion!: number;
  @Column({
    name: 'entregado_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  entregado_en!: Date | null;
  @Column({
    name: 'destinatario',
    type: 'character varying',
    nullable: false,
    length: 160,
  })
  destinatario!: string;
  @Column({ name: 'longitud', type: 'double precision', nullable: true })
  longitud!: number | null;
  @Column({
    name: 'referencias',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  referencias!: string | null;
  @Column({
    name: 'direccion',
    type: 'character varying',
    nullable: false,
    length: 500,
  })
  direccion!: string;
  @Column({ name: 'despachado_por', type: 'uuid', nullable: true })
  despachado_por!: string | null;
  @Column({ name: 'entregado_por', type: 'uuid', nullable: true })
  entregado_por!: string | null;
  @Column({ name: 'id_solicitud', type: 'uuid', nullable: false })
  id_solicitud!: string;
  @Column({
    name: 'despachado_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  despachado_en!: Date | null;
  @Column({ name: 'tarifa_ctvs', type: 'bigint', nullable: false })
  tarifa_ctvs!: string;
  @Column({
    name: 'comprobante_hasta',
    type: 'timestamp with time zone',
    nullable: true,
  })
  comprobante_hasta!: Date | null;
  @ManyToOne(() => Order, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pedido',
      referencedColumnName: 'id_pedido',
      foreignKeyConstraintName: 'entrega_domicilio_id_pedido_fkey',
    },
  ])
  order?: Relation<Order>;
  @ManyToOne(() => DeliveryRequest, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_solicitud',
      referencedColumnName: 'id_solicitud',
      foreignKeyConstraintName: 'entrega_domicilio_id_solicitud_fkey',
    },
  ])
  request?: Relation<DeliveryRequest>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'despachado_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'entrega_domicilio_despachado_por_fkey',
    },
  ])
  dispatchedBy?: Relation<User>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'entregado_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'entrega_domicilio_entregado_por_fkey',
    },
  ])
  deliveredBy?: Relation<User>;
}
