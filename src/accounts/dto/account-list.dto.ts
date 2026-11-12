import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';

export class AccountListDto {
  @ApiPropertyOptional({ enum: ['local', 'delivery'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['local', 'delivery'])
  modality?: string;
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
  @ApiPropertyOptional({ enum: ['open', 'closed'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['open', 'closed'])
  status?: string;
}
