import { ApiProperty } from '@nestjs/swagger';

export class DeliverySettingsResponseDto {
  @ApiProperty()
  receiptSubmissionSeconds: number;
  @ApiProperty()
  version: number;
  @ApiProperty()
  enabled: boolean;
  @ApiProperty()
  coverageDescription: string;
  @ApiProperty()
  shippingFeeCents: number;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
}
