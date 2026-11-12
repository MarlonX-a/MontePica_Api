import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliverySnapshotDto } from './delivery-snapshot.dto.js';
import { OrderDetailItemDto } from './order-detail-item.dto.js';
import { OrderSettlementDto } from './order-settlement.dto.js';

export class OrderResponseDto {
  @ApiProperty({ enum: ['local', 'delivery'] })
  modality: string;
  @ApiProperty()
  productsCents: number;
  @ApiProperty()
  shippingCents: number;
  @ApiPropertyOptional({
    type: DeliverySnapshotDto,
    nullable: true,
    description: 'Solo en detalle; se omite en listados.',
  })
  delivery?: DeliverySnapshotDto | null;
  @ApiProperty({ type: OrderSettlementDto, nullable: true })
  settlement: OrderSettlementDto | null;
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  visitId: string | null;
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty({ format: 'uuid' })
  accountId: string;
  @ApiProperty({
    enum: [
      'submitted',
      'preparing',
      'ready',
      'dispatched',
      'delivered',
      'cancelled',
    ],
  })
  status: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  editableUntil: string | null;
  @ApiProperty()
  canEdit: boolean;
  @ApiProperty({ format: 'date-time' })
  submittedAt: string;
  @ApiProperty({ format: 'uuid' })
  versionId: string;
  @ApiProperty()
  version: number;
  @ApiProperty({ type: String, nullable: true })
  notes: string | null;
  @ApiProperty()
  totalCents: number;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
  @ApiProperty({ type: [OrderDetailItemDto] })
  items: OrderDetailItemDto[];
}
