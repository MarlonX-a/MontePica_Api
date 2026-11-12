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
import { RedemptionRequest } from './redemption-request.entity.js';

@Entity('reserva_puntos_canje')
@Unique('reserva_puntos_canje_id_canje_key', ['id_canje'])
@Check('reserva_puntos_canje_puntos_check', '(puntos > 0)')
@Check(
  'reserva_puntos_canje_estado_check',
  "((estado)::text = ANY ((ARRAY['active'::character varying, 'consumed'::character varying, 'released'::character varying])::text[]))",
)
export class RedemptionPointsReservation {
  @Column({ name: 'id_canje', type: 'uuid', nullable: false })
  id_canje!: string;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'active'",
  })
  estado!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({
    name: 'resuelta_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  resuelta_en!: Date | null;
  @Column({ name: 'id_cliente', type: 'uuid', nullable: false })
  id_cliente!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_reserva',
    primaryKeyConstraintName: 'reserva_puntos_canje_pkey',
  })
  id_reserva!: string;
  @Column({ name: 'puntos', type: 'bigint', nullable: false })
  puntos!: string;
  @ManyToOne(() => RedemptionRequest, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_canje',
      referencedColumnName: 'id_canje',
      foreignKeyConstraintName: 'reserva_puntos_canje_id_canje_fkey',
    },
  ])
  redemption?: Relation<RedemptionRequest>;
  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'reserva_puntos_canje_id_cliente_fkey',
    },
  ])
  client?: Relation<Client>;
}
