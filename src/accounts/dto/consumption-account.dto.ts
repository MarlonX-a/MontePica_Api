import { ApiProperty } from '@nestjs/swagger';

export class ConsumptionAccountDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ enum: ['open', 'closed'] })
  status: string;
  @ApiProperty({ enum: ['local'] })
  modality: string;
  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: Date | null;
}
