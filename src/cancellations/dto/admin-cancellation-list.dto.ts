import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { CancellationListDto } from './cancellation-list.dto.js';

export class AdminCancellationListDto extends CancellationListDto {
  @ApiPropertyOptional({ enum: ['local', 'delivery'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['local', 'delivery'])
  modality?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  operatingDayId?: string;
}
