import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RefundResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  cancellationRequestId: string;
  @ApiProperty({ format: 'uuid' })
  orderId: string;
  @ApiProperty({ format: 'uuid' })
  paymentId: string;
  @ApiProperty({
    description: 'Importe autorizado pendiente de entregar, en centavos.',
  })
  amountCents: number;
  @ApiProperty({ enum: ['pending', 'completed'] })
  status: string;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiPropertyOptional({ enum: ['cash', 'transfer'], nullable: true })
  method?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  executedAt?: string | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  refundedCents?: number;
}
