import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateOperationsSettingsDto {
  @ApiPropertyOptional({ example: 'America/Guayaquil', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  timeZone?: string;

  @ApiPropertyOptional({ example: '09:00', description: 'Hora local en formato HH:mm.' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  openingTime?: string;

  @ApiPropertyOptional({ example: '22:00', description: 'Hora local en formato HH:mm.' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closingTime?: string;
}
