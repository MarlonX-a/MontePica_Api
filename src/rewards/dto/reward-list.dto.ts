import { booleanQueryValue } from '../../common/dto/boolean-query.transform.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RewardListDto {
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
  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  search?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional()
  @Transform(({ value }) => booleanQueryValue(value))
  @IsBoolean()
  active?: boolean;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  productId?: string;
}
