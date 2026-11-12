import { ApiProperty } from '@nestjs/swagger';
import { PaymentHistoryDto } from './payment-history.dto.js';
import { PaymentResponseDto } from './payment-response.dto.js';

export class AdminPaymentResponseDto extends PaymentResponseDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  registeredBy: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  registeredByGuestSessionId: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  verifiedBy: string | null;
  @ApiProperty({ type: String, nullable: true })
  bankOperationReference: string | null;
  @ApiProperty({ type: [PaymentHistoryDto] })
  history: PaymentHistoryDto[];
}
