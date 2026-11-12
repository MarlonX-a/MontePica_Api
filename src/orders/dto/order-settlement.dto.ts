import { ApiProperty } from '@nestjs/swagger';

export class OrderSettlementDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty()
  status: string;
}
