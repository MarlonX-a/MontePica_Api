import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';
import { RedemptionListDto } from './redemption-list.dto.js';

export class AdminRedemptionListDto extends RedemptionListDto {
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  clientId?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  operatingDayId?: string;
}
