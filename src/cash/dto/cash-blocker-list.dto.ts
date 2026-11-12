import { ApiProperty } from '@nestjs/swagger';
import { CashBlockerDto } from './cash-blocker.dto.js';

export class CashBlockerListDto {
  @ApiProperty({ type: [CashBlockerDto] })
  items: CashBlockerDto[];
  @ApiProperty()
  total: number;
  @ApiProperty({ default: 1 })
  page: number;
  @ApiProperty({ default: 100 })
  limit: number;
}
