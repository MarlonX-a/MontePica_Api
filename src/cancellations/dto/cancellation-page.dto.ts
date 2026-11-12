import { ApiProperty } from '@nestjs/swagger';
import { CancellationResponseDto } from './cancellation-response.dto.js';

export class CancellationPageDto {
  @ApiProperty({ type: [CancellationResponseDto] })
  items: CancellationResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
