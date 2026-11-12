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
import { Payment } from '../../payments/entities/payment.entity.js';

@Entity('comprobante')
@Unique('comprobante_id_pago_key', ['id_pago'])
@Unique('comprobante_archivo_privado_key', ['archivo_privado'])
@Check(
  'comprobante_mime_check',
  "((mime)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/png'::character varying, 'application/pdf'::character varying])::text[]))",
)
@Check('comprobante_tamano_check', '((tamano >= 1) AND (tamano <= 5242880))')
export class Receipt {
  @Column({ name: 'sha256', type: 'character', nullable: false, length: 64 })
  sha256!: string;
  @Column({ name: 'archivo_privado', type: 'text', nullable: false })
  archivo_privado!: string;
  @Column({
    name: 'cargado_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  cargado_en!: Date;
  @Column({
    name: 'mime',
    type: 'character varying',
    nullable: false,
    length: 40,
  })
  mime!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_comprobante',
    primaryKeyConstraintName: 'comprobante_pkey',
  })
  id_comprobante!: string;
  @Column({ name: 'id_pago', type: 'uuid', nullable: false })
  id_pago!: string;
  @Column({ name: 'tamano', type: 'integer', nullable: false })
  tamano!: number;
  @ManyToOne(() => Payment, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pago',
      referencedColumnName: 'id_pago',
      foreignKeyConstraintName: 'comprobante_id_pago_fkey',
    },
  ])
  payment?: Relation<Payment>;
}
