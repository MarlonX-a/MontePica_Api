import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class PointsQueryDto {
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
    enum: ['earn', 'refundAdjustment', 'redeem', 'redemptionReturn'],
  })
  @IsIn(['earn', 'refundAdjustment', 'redeem', 'redemptionReturn'])
  type?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  paymentId?: string;
}
