import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RedemptionHistoryDto } from './redemption-history.dto.js';

export class RedemptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  clientId: string;
  @ApiProperty({ format: 'uuid' })
  participantId: string;
  @ApiProperty({ format: 'uuid' })
  accountId: string;
  @ApiProperty({ format: 'uuid' })
  visitId: string;
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty({ format: 'uuid' })
  rewardId: string;
  @ApiProperty()
  rewardVersion: number;
  @ApiProperty({ format: 'uuid' })
  productId: string;
  @ApiProperty()
  rewardName: string;
  @ApiProperty()
  productName: string;
  @ApiProperty()
  pointsCost: number;
  @ApiProperty({
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'expired'],
  })
  status: string;
  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  resolvedAt: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  orderId: string | null;
  @ApiProperty({ type: String, nullable: true })
  reason: string | null;
  @ApiPropertyOptional({ type: [RedemptionHistoryDto] })
  history?: RedemptionHistoryDto[];
}
