import { ApiProperty } from '@nestjs/swagger';

export class ResolvedTableQrDto {
  @ApiProperty({ format: 'uuid' })
  visitId: string;
  @ApiProperty({ format: 'uuid' })
  tableId: string;
  @ApiProperty()
  tableCode: string;
  @ApiProperty({ minimum: 1 })
  qrVersion: number;
}
