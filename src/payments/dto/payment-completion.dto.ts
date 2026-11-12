import { ApiProperty } from '@nestjs/swagger';
import { AdminPaymentResponseDto } from './admin-payment-response.dto.js';
import { PaymentResourceStateDto } from './payment-resource-state.dto.js';

export class PaymentCompletionDto {
  @ApiProperty({ type: AdminPaymentResponseDto, nullable: true })
  payment: AdminPaymentResponseDto | null;
  @ApiProperty({ type: PaymentResourceStateDto })
  settlement: PaymentResourceStateDto;
  @ApiProperty({ type: PaymentResourceStateDto })
  account: PaymentResourceStateDto;
  @ApiProperty({ type: PaymentResourceStateDto })
  participant: PaymentResourceStateDto;
}
