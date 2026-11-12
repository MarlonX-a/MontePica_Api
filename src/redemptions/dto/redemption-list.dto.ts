import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class RedemptionListDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'expired'],
  })
  @IsIn(['pending', 'approved', 'rejected', 'cancelled', 'expired'])
  status?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  visitId?: string;
}
