import { ApiProperty } from '@nestjs/swagger';
import { AdminCancellationResponseDto } from './admin-cancellation-response.dto.js';
import { CancellationPageDto } from './cancellation-page.dto.js';

export class AdminCancellationPageDto extends CancellationPageDto {
  @ApiProperty({ type: [AdminCancellationResponseDto] })
  declare items: AdminCancellationResponseDto[];
}
