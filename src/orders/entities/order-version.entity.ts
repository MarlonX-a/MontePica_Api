import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { Order } from './order.entity.js';

@Entity('version_pedido')
@Unique('version_pedido_id_pedido_numero_key', ['id_pedido', 'numero'])
@Index('uq_version_pedido_vigente', ['id_pedido'], {
  unique: true,
  where: "((estado)::text = 'current'::text)",
})
@Check('version_pedido_numero_check', '(numero > 0)')
@Check(
  'version_pedido_estado_check',
  "((estado)::text = ANY ((ARRAY['current'::character varying, 'superseded'::character varying])::text[]))",
)
@Check(
  'version_pedido_total_productos_ctvs_check',
  '(total_productos_ctvs >= 0)',
)
export class OrderVersion {
  @Column({
    name: 'observaciones',
    type: 'character varying',
    nullable: true,
    length: 500,
  })
  observaciones!: string | null;
  @Column({ name: 'numero', type: 'integer', nullable: false })
  numero!: number;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({
    name: 'estado',
    type: 'character varying',
    nullable: false,
    length: 20,
  })
  estado!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_version',
    primaryKeyConstraintName: 'version_pedido_pkey',
  })
  id_version!: string;
  @Column({ name: 'id_pedido', type: 'uuid', nullable: false })
  id_pedido!: string;
  @Column({ name: 'total_productos_ctvs', type: 'bigint', nullable: false })
  total_productos_ctvs!: string;
  @ManyToOne(() => Order, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_pedido',
      referencedColumnName: 'id_pedido',
      foreignKeyConstraintName: 'version_pedido_id_pedido_fkey',
    },
  ])
  order?: Relation<Order>;
}
