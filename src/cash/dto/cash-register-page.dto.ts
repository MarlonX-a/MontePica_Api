import { ApiProperty } from '@nestjs/swagger';
import { CashRegisterDto } from './cash-register.dto.js';

export class CashRegisterPageDto {
  @ApiProperty({ type: [CashRegisterDto] })
  items: CashRegisterDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
