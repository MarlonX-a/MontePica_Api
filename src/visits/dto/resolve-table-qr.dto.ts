import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ResolveTableQrDto {
  @ApiProperty({
    description: 'Token opaco entregado al emitir el QR.',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @Length(1, 128)
  qrToken: string;
}
