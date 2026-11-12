import { ApiPropertyOptional } from '@nestjs/swagger';
import { RefundResponseDto } from './refund-response.dto.js';

export class AdminRefundResponseDto extends RefundResponseDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  executedBy?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  cashRegisterId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  bankOperationReference?: string | null;
  @ApiPropertyOptional({ nullable: true })
  recipientName?: string | null;
  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  history?: Record<string, unknown>[];
}
