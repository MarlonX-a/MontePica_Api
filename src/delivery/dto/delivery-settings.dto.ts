import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsString, Length, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DeliverySettingsDto {
  @ApiProperty({ default: 900, minimum: 60, maximum: 86400 })
  @IsInt()
  @Min(60)
  @Max(86400)
  receiptSubmissionSeconds = 900;
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  coverageDescription: string;
  @ApiProperty({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  shippingFeeCents: number;
}
