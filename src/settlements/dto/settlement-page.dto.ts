import { ApiProperty } from '@nestjs/swagger';
import { SettlementResponseDto } from './settlement-response.dto.js';

export class SettlementPageDto {
  @ApiProperty({ type: [SettlementResponseDto] })
  items: SettlementResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
