import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sesion_usuario' })
export class UserSession {
  @PrimaryGeneratedColumn('uuid', { name: 'id_sesion_usuario' })
  id: string;

  @Column({ name: 'id_usuario', type: 'uuid' })
  userId: string;

  @Column({ name: 'refresh_hash', type: 'char', length: 64, unique: true })
  refreshHash: string;

  @Column({ name: 'generacion', type: 'integer', default: 0 })
  generation: number;

  @Column({ name: 'creada_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revocada_en', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
