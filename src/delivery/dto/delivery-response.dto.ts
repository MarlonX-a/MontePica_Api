import { ApiProperty } from '@nestjs/swagger';

export class DeliveryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  clientId: string;
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty()
  configurationVersion: number;
  @ApiProperty()
  recipientName: string;
  @ApiProperty()
  phone: string;
  @ApiProperty()
  address: string;
  @ApiProperty({ type: String, nullable: true })
  references: string | null;
  @ApiProperty({ type: Number, nullable: true })
  latitude: number | null;
  @ApiProperty({ type: Number, nullable: true })
  longitude: number | null;
  @ApiProperty()
  shippingFeeCents: number;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'cancelled'] })
  status: string;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  decidedAt: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  decidedBy: string | null;
  @ApiProperty({ type: String, nullable: true })
  rejectionReason: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  cancelledAt: string | null;
  @ApiProperty()
  usableToday: boolean;
}
