import { ApiProperty } from '@nestjs/swagger';
import { RedemptionResponseDto } from './redemption-response.dto.js';

export class RedemptionPageDto {
  @ApiProperty({ type: [RedemptionResponseDto] })
  items: RedemptionResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
