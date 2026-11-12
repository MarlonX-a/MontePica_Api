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
import { OperatingDay } from '../../operations/entities/operating-day.entity.js';
import { Participant } from '../../participants/entities/participant.entity.js';

@Entity('cuenta_consumo')
@Unique('uq_cuenta_participante', ['id_participante'])
@Check(
  'ck_cuenta_estado',
  "((estado)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying])::text[]))",
)
@Check(
  'ck_cuenta_modalidad',
  "((((modalidad)::text = 'local'::text) AND (id_participante IS NOT NULL)) OR (((modalidad)::text = 'delivery'::text) AND (id_participante IS NULL)))",
)
export class ConsumptionAccount {
  @Column({
    name: 'cerrada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  cerrada_en!: Date | null;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'open'",
  })
  estado!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_cuenta',
    primaryKeyConstraintName: 'pk_cuenta_consumo',
  })
  id_cuenta!: string;
  @Column({ name: 'id_jornada', type: 'uuid', nullable: false })
  id_jornada!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({ name: 'id_participante', type: 'uuid', nullable: true })
  id_participante!: string | null;
  @Column({ name: 'id_cliente', type: 'uuid', nullable: false })
  id_cliente!: string;
  @Column({
    name: 'modalidad',
    type: 'character varying',
    nullable: false,
    length: 16,
    default: () => "'local'",
  })
  modalidad!: string;
  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_cuenta_cliente',
    },
  ])
  client?: Relation<Client>;
  @ManyToOne(() => Participant, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_participante',
      referencedColumnName: 'id_participante',
      foreignKeyConstraintName: 'fk_cuenta_participante',
    },
  ])
  participant?: Relation<Participant>;
  @ManyToOne(() => OperatingDay, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_jornada',
      referencedColumnName: 'id_jornada',
      foreignKeyConstraintName: 'fk_cuenta_jornada',
    },
  ])
  operatingDay?: Relation<OperatingDay>;
}
