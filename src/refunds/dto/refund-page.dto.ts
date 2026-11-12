import { ApiProperty } from '@nestjs/swagger';
import { RefundResponseDto } from './refund-response.dto.js';

export class RefundPageDto {
  @ApiProperty({ type: [RefundResponseDto] })
  items: RefundResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
