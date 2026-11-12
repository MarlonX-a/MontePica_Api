import { ApiProperty } from '@nestjs/swagger';
import { GuestClientDto } from './guest-client.dto.js';

export class GuestSessionDto {
  @ApiProperty({ type: GuestClientDto })
  client: GuestClientDto;
  @ApiProperty({
    description:
      'Token guest_ de 24 horas. Solo se entrega al crear la sesión.',
  })
  token: string;
  @ApiProperty({ format: 'uuid' })
  sessionId: string;
  @ApiProperty({ format: 'date-time' })
  expiresAt: Date;
}
