import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateOperationsSettingsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 3600, example: 300 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(3600)
  localOrderEditSeconds?: number;
  @ApiPropertyOptional({ example: 'America/Guayaquil', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  timeZone?: string;

  @ApiPropertyOptional({
    example: '09:00',
    description: 'Hora local en formato HH:mm.',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  openingTime?: string;

  @ApiPropertyOptional({
    example: '22:00',
    description: 'Hora local en formato HH:mm.',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closingTime?: string;
}
