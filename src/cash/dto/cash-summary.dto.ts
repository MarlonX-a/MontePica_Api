import { ApiProperty } from '@nestjs/swagger';

export class CashSummaryDto {
  @ApiProperty({ format: 'uuid' })
  cashRegisterId: string;
  @ApiProperty({ enum: ['open', 'closed'] })
  status: string;
  @ApiProperty({ type: 'integer' })
  openingCents: number;
  @ApiProperty({ type: 'integer' })
  cashIncomeCents: number;
  @ApiProperty({ type: 'integer' })
  cashRefundsCents: number;
  @ApiProperty({ type: 'integer' })
  balanceCents: number;
  @ApiProperty({
    type: 'integer',
    description: 'Transferencias confirmadas, separadas del efectivo físico.',
  })
  confirmedTransferCents: number;
  @ApiProperty({ type: Object, nullable: true })
  closure: {
    id: string;
    closedAt: string;
    closedBy: string;
    countedCents: number;
    differenceCents: number;
    reason: string | null;
  } | null;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
}
