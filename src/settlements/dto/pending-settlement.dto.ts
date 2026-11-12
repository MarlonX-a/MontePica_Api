import { ApiProperty } from '@nestjs/swagger';

export class PendingSettlementDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ enum: ['pending'] })
  status: string;
  @ApiProperty()
  totalCents: number;
}
