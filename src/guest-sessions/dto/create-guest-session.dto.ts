import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateGuestSessionDto {
  @ApiProperty({ example: 'María', minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  name: string;

  @ApiPropertyOptional({ maxLength: 20, example: '0987654321' })
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone?: string;
}
