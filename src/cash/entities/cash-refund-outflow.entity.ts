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
import { Refund } from '../../refunds/entities/refund.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { CashRegister } from './cash-register.entity.js';

@Entity('salida_caja_devolucion')
@Unique('salida_caja_devolucion_id_devolucion_key', ['id_devolucion'])
@Check(
  'salida_caja_devolucion_importe_ctvs_check',
  "((importe_ctvs > 0) AND (importe_ctvs <= '9007199254740991'::bigint))",
)
export class CashRefundOutflow {
  @Column({
    name: 'registrada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  registrada_en!: Date;
  @Column({ name: 'importe_ctvs', type: 'bigint', nullable: false })
  importe_ctvs!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_salida',
    primaryKeyConstraintName: 'salida_caja_devolucion_pkey',
  })
  id_salida!: string;
  @Column({ name: 'id_caja', type: 'uuid', nullable: false })
  id_caja!: string;
  @Column({ name: 'id_devolucion', type: 'uuid', nullable: false })
  id_devolucion!: string;
  @Column({ name: 'registrada_por', type: 'uuid', nullable: false })
  registrada_por!: string;
  @ManyToOne(() => Refund, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_devolucion',
      referencedColumnName: 'id_devolucion',
      foreignKeyConstraintName: 'salida_caja_devolucion_id_devolucion_fkey',
    },
  ])
  refund?: Relation<Refund>;
  @ManyToOne(() => CashRegister, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_caja',
      referencedColumnName: 'id_caja',
      foreignKeyConstraintName: 'salida_caja_devolucion_id_caja_fkey',
    },
  ])
  cashRegister?: Relation<CashRegister>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'registrada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'salida_caja_devolucion_registrada_por_fkey',
    },
  ])
  user?: Relation<User>;
}
