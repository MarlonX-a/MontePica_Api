import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RewardUpdateDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  name?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(0, 500)
  description?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  pointsCost?: number;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional()
  @IsBoolean()
  active?: boolean;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder?: number;
}
