import { ApiProperty } from '@nestjs/swagger';
import { AccountResponseDto } from './account-response.dto.js';

export class AccountPageDto {
  @ApiProperty({ type: [AccountResponseDto] })
  items: AccountResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
