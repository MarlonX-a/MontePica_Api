import { ApiProperty } from '@nestjs/swagger';
import { PaymentResponseDto } from './payment-response.dto.js';

export class PaymentPageDto {
  @ApiProperty({ type: [PaymentResponseDto] })
  items: PaymentResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
