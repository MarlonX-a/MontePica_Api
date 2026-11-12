import { ApiProperty } from '@nestjs/swagger';

export class DeliverySnapshotDto {
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  receiptSubmissionDeadline: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  dispatchedAt: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  deliveredAt: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  dispatchedBy: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  deliveredBy: string | null;
  @ApiProperty({ format: 'uuid' })
  requestId: string;
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
  configurationVersion: number;
  @ApiProperty()
  shippingCents: number;
}
