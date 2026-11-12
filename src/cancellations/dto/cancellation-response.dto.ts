import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CancellationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  orderId: string;
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty({ format: 'uuid' })
  versionId: string;
  @ApiProperty({ enum: ['local', 'delivery'] })
  modality: string;
  @ApiProperty()
  orderStatus: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'withdrawn'] })
  status: string;
  @ApiProperty()
  reason: string;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  rejectionReason: string | null;
  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  refund?: Record<string, unknown> | null;
}
