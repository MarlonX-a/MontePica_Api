import { ApiProperty } from '@nestjs/swagger';

export class CashClosureResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  cashRegisterId: string;
  @ApiProperty({ format: 'uuid' })
  closedBy: string;
  @ApiProperty({ format: 'date-time' })
  closedAt: string;
  @ApiProperty()
  openingCents: number;
  @ApiProperty()
  cashIncomeCents: number;
  @ApiProperty()
  cashRefundsCents: number;
  @ApiProperty()
  expectedCents: number;
  @ApiProperty()
  countedCents: number;
  @ApiProperty()
  differenceCents: number;
  @ApiProperty({ type: String, nullable: true })
  reason: string | null;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
}
