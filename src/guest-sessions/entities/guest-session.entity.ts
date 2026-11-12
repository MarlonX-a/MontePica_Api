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
import { Client } from '../../common/identity/entities/client.entity.js';

@Entity('sesion_cliente')
@Unique('uq_sesion_cliente_token_hash', ['token_hash'])
@Index('ix_sesion_cliente_vigente', ['expira_en', 'id_cliente'], {
  unique: false,
  where: '(revocada_en IS NULL)',
})
@Check('ck_sesion_cliente_expira', '(expira_en > creada_en)')
export class GuestSession {
  @Column({ name: 'id_cliente', type: 'uuid', nullable: false })
  id_cliente!: string;
  @Column({
    name: 'expira_en',
    type: 'timestamp with time zone',
    nullable: false,
  })
  expira_en!: Date;
  @Column({
    name: 'revocada_en',
    type: 'timestamp with time zone',
    nullable: true,
  })
  revocada_en!: Date | null;
  @PrimaryGeneratedColumn('uuid', {
    name: 'id_sesion_cliente',
    primaryKeyConstraintName: 'pk_sesion_cliente',
  })
  id_sesion_cliente!: string;
  @Column({
    name: 'creada_en',
    type: 'timestamp with time zone',
    nullable: false,
    default: () => 'now()',
  })
  creada_en!: Date;
  @Column({
    name: 'token_hash',
    type: 'character',
    nullable: false,
    length: 64,
  })
  token_hash!: string;
  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    {
      name: 'id_cliente',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_sesion_cliente_cliente',
    },
  ])
  client?: Relation<Client>;
}
