import { ApiProperty } from '@nestjs/swagger';
import { AdminRefundResponseDto } from './admin-refund-response.dto.js';
import { RefundPageDto } from './refund-page.dto.js';

export class AdminRefundPageDto extends RefundPageDto {
  @ApiProperty({ type: [AdminRefundResponseDto] })
  declare items: AdminRefundResponseDto[];
}
