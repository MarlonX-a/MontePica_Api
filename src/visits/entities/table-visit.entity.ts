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
import { OperatingDay } from '../../operations/entities/operating-day.entity.js';
import { RestaurantTable } from '../../tables/entities/restaurant-table.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('visita_mesa')
@Index('uq_visita_mesa_abierta', ['id_mesa'], {
  unique: true,
  where: "((estado)::text = 'open'::text)",
})
@Check(
  'ck_visita_mesa_estado',
  "((estado)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying])::text[]))",
)
@Check(
  'ck_visita_mesa_fechas',
  "((((estado)::text = 'open'::text) AND (cerrada_en IS NULL)) OR (((estado)::text = 'closed'::text) AND (cerrada_en IS NOT NULL)))",
)
export class TableVisit {
  @Column({ name: 'abierta_por', type: 'uuid', nullable: false })
  abierta_por!: string;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_visita',
    primaryKeyConstraintName: 'pk_visita_mesa',
  })
  id_visita!: string;
  @Column({ name: 'id_jornada', type: 'uuid', nullable: false })
  id_jornada!: string;
  @Column({
    name: 'abierta_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  abierta_en!: Date;
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
  @Column({ name: 'cerrada_por', type: 'uuid', nullable: true })
  cerrada_por!: string | null;
  @Column({ name: 'id_mesa', type: 'uuid', nullable: false })
  id_mesa!: string;
  @ManyToOne(() => RestaurantTable, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_mesa',
      referencedColumnName: 'id_mesa',
      foreignKeyConstraintName: 'fk_visita_mesa_mesa',
    },
  ])
  table?: Relation<RestaurantTable>;
  @ManyToOne(() => OperatingDay, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_jornada',
      referencedColumnName: 'id_jornada',
      foreignKeyConstraintName: 'fk_visita_mesa_jornada',
    },
  ])
  operatingDay?: Relation<OperatingDay>;
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'abierta_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_visita_mesa_abierta_por',
    },
  ])
  user?: Relation<User>;
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'cerrada_por',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_visita_mesa_cerrada_por',
    },
  ])
  userRelation?: Relation<User>;
}
