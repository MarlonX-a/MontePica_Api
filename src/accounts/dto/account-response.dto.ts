import { ApiProperty } from '@nestjs/swagger';
import { PendingSettlementDto } from '../../settlements/dto/pending-settlement.dto.js';
import { ConsumptionLineDto } from './consumption-line.dto.js';

export class AccountResponseDto {
  @ApiProperty({ enum: ['local', 'delivery'] })
  modality: string;
  @ApiProperty()
  productsCents: number;
  @ApiProperty()
  shippingCents: number;
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  clientId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  participantId: string | null;
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  visitId: string | null;
  @ApiProperty({ enum: ['open', 'closed'] })
  status: string;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  closedAt: string | null;
  @ApiProperty({ type: [ConsumptionLineDto] })
  items: ConsumptionLineDto[];
  @ApiProperty()
  totalCents: number;
  @ApiProperty()
  paidCents: number;
  @ApiProperty()
  refundPendingCents: number;
  @ApiProperty()
  refundedCents: number;
  @ApiProperty()
  pendingCents: number;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
  @ApiProperty({ type: PendingSettlementDto, nullable: true })
  pendingSettlement: PendingSettlementDto | null;
}
