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
import { GuestSession } from '../../guest-sessions/entities/guest-session.entity.js';
import { Settlement } from '../../settlements/entities/settlement.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('pago')
@Index('uq_pago_transferencia_pendiente', ['id_liquidacion'], {
  unique: true,
  where: "((estado)::text = 'pendingVerification'::text)",
})
@Index('uq_pago_confirmado_liquidacion', ['id_liquidacion'], {
  unique: true,
  where: "((estado)::text = 'confirmed'::text)",
})
@Index('uq_pago_operacion_bancaria', ['operacion_bancaria_confirmada'], {
  unique: true,
  where: '(operacion_bancaria_confirmada IS NOT NULL)',
})
@Check('pago_importe_ctvs_check', '(importe_ctvs > 0)')
@Check('pago_check1', '(cambio_ctvs = (recibido_ctvs - importe_ctvs))')
@Check(
  'ck_pago_metodo',
  "((metodo)::text = ANY ((ARRAY['cash'::character varying, 'transfer'::character varying])::text[]))",
)
@Check(
  'ck_pago_estado',
  "((estado)::text = ANY ((ARRAY['pendingVerification'::character varying, 'confirmed'::character varying, 'rejected'::character varying])::text[]))",
)
@Check(
  'ck_pago_actor',
  '(num_nonnulls(registrado_usuario, registrado_sesion_cliente) = 1)',
)
@Check(
  'ck_pago_forma',
  "((((metodo)::text = 'cash'::text) AND ((estado)::text = 'confirmed'::text) AND (recibido_ctvs IS NOT NULL) AND (cambio_ctvs IS NOT NULL) AND (recibido_ctvs >= importe_ctvs) AND (cambio_ctvs = (recibido_ctvs - importe_ctvs))) OR (((metodo)::text = 'transfer'::text) AND (recibido_ctvs IS NULL) AND (cambio_ctvs IS NULL) AND (pagador_cliente IS NOT NULL)))",
)
@Check(
  'ck_pago_decision',
  "(((metodo)::text = 'cash'::text) OR (((estado)::text = 'pendingVerification'::text) AND (verificado_por IS NULL) AND (verificado_en IS NULL) AND (motivo_rechazo IS NULL) AND (operacion_bancaria_confirmada IS NULL)) OR (((estado)::text = 'confirmed'::text) AND (verificado_por IS NOT NULL) AND (verificado_en IS NOT NULL) AND (motivo_rechazo IS NULL) AND (operacion_bancaria_confirmada IS NOT NULL) AND (length(TRIM(BOTH FROM operacion_bancaria_confirmada)) > 0)) OR (((estado)::text = 'rejected'::text) AND (verificado_por IS NOT NULL) AND (verificado_en IS NOT NULL) AND (motivo_rechazo IS NOT NULL) AND (length(TRIM(BOTH FROM motivo_rechazo)) > 0) AND (operacion_bancaria_confirmada IS NULL)))",
)
export class Payment {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_pago',
    primaryKeyConstraintName: 'pago_pkey',
  })
  id_pago!: string;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 32,
  })
  estado!: string;
  @Column({ name: 'cambio_ctvs', type: 'bigint', nullable: true })
  cambio_ctvs!: string | null;
  @Column({
    name: 'creado_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creado_en!: Date;
  @Column({
    name: 'motivo_rechazo',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  motivo_rechazo!: string | null;
  @Column({
    name: 'metodo',
    type: 'character varying',
    nullable: false,
    length: 16,
  })
  metodo!: string;
  @Column({ name: 'registrado_usuario', type: 'uuid', nullable: true })
  registrado_usuario!: string | null;
  @Column({ name: 'recibido_ctvs', type: 'bigint', nullable: true })
  recibido_ctvs!: string | null;
  @Column({ name: 'importe_ctvs', type: 'bigint', nullable: false })
  importe_ctvs!: string;
  @Column({
    name: 'verificado_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  verificado_en!: Date | null;
  @Column({
    name: 'operacion_bancaria_confirmada',
    type: 'character varying',
    nullable: true,
    length: 120,
  })
  operacion_bancaria_confirmada!: string | null;
  @Column({ name: 'id_liquidacion', type: 'uuid', nullable: false })
  id_liquidacion!: string;
  @Column({ name: 'verificado_por', type: 'uuid', nullable: true })
  verificado_por!: string | null;
  @Column({ name: 'registrado_sesion_cliente', type: 'uuid', nullable: true })
  registrado_sesion_cliente!: string | null;
  @Column({ name: 'pagador_cliente', type: 'uuid', nullable: true })
  pagador_cliente!: string | null;
  @ManyToOne(() => Settlement, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_liquidacion',
      referencedColumnName: 'id_liquidacion',
      foreignKeyConstraintName: 'pago_id_liquidacion_fkey',
    },
  ])
  settlement?: Relation<Settlement>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'registrado_usuario',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'pago_registrado_usuario_fkey',
    },
  ])
  user?: Relation<User>;
  @ManyToOne(() => GuestSession, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'registrado_sesion_cliente',
      referencedColumnName: 'id_sesion_cliente',
      foreignKeyConstraintName: 'pago_registrado_sesion_cliente_fkey',
    },
  ])
  guestSession?: Relation<GuestSession>;
  @ManyToOne(() => Client, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'pagador_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'pago_pagador_cliente_fkey',
    },
  ])
  client?: Relation<Client>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'verificado_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'pago_verificado_por_fkey',
    },
  ])
  verifiedBy?: Relation<User>;
}
