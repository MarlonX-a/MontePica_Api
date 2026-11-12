import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DeliveryRequestDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  configurationVersion: number;
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  recipientName: string;
  @ApiProperty({ minLength: 1, maxLength: 20 })
  @Transform(trim)
  @IsString()
  @Length(1, 20)
  phone: string;
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  address: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @Length(0, 500)
  references?: string;
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude?: number;
  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
}
