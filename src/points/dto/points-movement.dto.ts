import { ApiProperty } from '@nestjs/swagger';

export class PointsMovementDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({
    enum: ['earn', 'refundAdjustment', 'redeem', 'redemptionReturn'],
  })
  type: string;
  @ApiProperty({ type: 'integer' })
  points: number;
  @ApiProperty({ format: 'uuid' })
  paymentId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  redemptionId: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  orderId: string | null;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
