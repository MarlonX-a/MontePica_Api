import { ApiProperty } from '@nestjs/swagger';

export class TransferDecisionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  settlementId: string;
  @ApiProperty({ enum: ['confirmed', 'rejected'] })
  status: string;
  @ApiProperty({ enum: ['settled', 'pending'] })
  settlementStatus: string;
}
