import { ApiProperty } from '@nestjs/swagger';
import { SettlementLineDto } from './settlement-line.dto.js';

export class SettlementResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  accountId: string;
  @ApiProperty({ format: 'uuid' })
  cashRegisterId: string;
  @ApiProperty({ enum: ['pending', 'cancelled', 'settled'] })
  status: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  settledAt: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['cash', 'zeroTotal', 'transfer'],
  })
  resolution: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  paymentId: string | null;
  @ApiProperty()
  productsCents: number;
  @ApiProperty()
  shippingCents: number;
  @ApiProperty()
  totalCents: number;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
  @ApiProperty({ format: 'uuid' })
  createdBy: string;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  cancelledBy: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  cancelledAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  cancellationReason: string | null;
  @ApiProperty({ type: [SettlementLineDto] })
  items: SettlementLineDto[];
}
