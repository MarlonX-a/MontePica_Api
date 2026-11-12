import { Check, Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('mesa')
@Unique('uq_mesa_codigo', ['codigo'])
@Unique('uq_mesa_qr_hash', ['qr_hash'])
@Check('ck_mesa_qr_version', '(qr_version >= 0)')
export class RestaurantTable {
  @Column({
    name: 'qr_version',
    type: 'integer',
    nullable: false,
    default: () => "'0'",
  })
  qr_version!: number;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_mesa',
    primaryKeyConstraintName: 'pk_mesa',
  })
  id_mesa!: string;
  @Column({ name: 'qr_hash', type: 'character', nullable: true, length: 64 })
  qr_hash!: string | null;
  @Column({
    name: 'codigo',
    type: 'character varying',
    nullable: false,
    length: 40,
  })
  codigo!: string;
  @Column({
    name: 'activa',
    type: 'boolean',
    nullable: false,
    default: () => 'true',
  })
  activa!: boolean;
}
