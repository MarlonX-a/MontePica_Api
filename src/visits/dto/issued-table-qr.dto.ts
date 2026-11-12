import { ApiProperty } from '@nestjs/swagger';

export class IssuedTableQrDto {
  @ApiProperty({ format: 'uuid' })
  visitId: string;
  @ApiProperty({
    description:
      'Secreto de un solo retorno; al emitir otro se invalida el anterior.',
  })
  qrToken: string;
  @ApiProperty({ minimum: 1 })
  qrVersion: number;
}
