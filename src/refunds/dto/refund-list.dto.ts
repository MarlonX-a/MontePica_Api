import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class RefundListDto {
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
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  orderId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  paymentId?: string;
  @ApiPropertyOptional({ enum: ['pending', 'completed'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['pending', 'completed'])
  status?: string;
  @ApiPropertyOptional({ enum: ['cash', 'transfer'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['cash', 'transfer'])
  method?: string;
}
