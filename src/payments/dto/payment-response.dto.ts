import { ApiProperty } from '@nestjs/swagger';

export class PaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  settlementId: string;
  @ApiProperty({ format: 'uuid' })
  accountId: string;
  @ApiProperty({ format: 'uuid' })
  cashRegisterId: string;
  @ApiProperty({ enum: ['cash', 'transfer'] })
  method: string;
  @ApiProperty({ enum: ['pendingVerification', 'confirmed', 'rejected'] })
  status: string;
  @ApiProperty()
  amountCents: number;
  @ApiProperty({
    description:
      'Importe históricamente cobrado; una devolución no modifica este dato.',
  })
  paidCents: number;
  @ApiProperty()
  refundPendingCents: number;
  @ApiProperty()
  refundedCents: number;
  @ApiProperty({ type: Number, nullable: true })
  receivedCents: number | null;
  @ApiProperty({ type: Number, nullable: true })
  changeCents: number | null;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  receipt: Record<string, unknown> | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  verifiedAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  rejectionReason: string | null;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
