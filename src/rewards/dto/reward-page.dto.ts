import { ApiProperty } from '@nestjs/swagger';
import { RewardResponseDto } from './reward-response.dto.js';

export class RewardPageDto {
  @ApiProperty({ type: [RewardResponseDto] })
  items: RewardResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
