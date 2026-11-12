import { ApiProperty } from '@nestjs/swagger';
import { CancellationResponseDto } from './cancellation-response.dto.js';

export class AdminCancellationResponseDto extends CancellationResponseDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  requestedBy: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  decidedBy: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  history: Record<string, unknown>[];
}
