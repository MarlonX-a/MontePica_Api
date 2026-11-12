import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

export class CloseCashRegisterDto {
  @ApiProperty({
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    description: 'Efectivo contado en centavos de USD.',
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  countedCents: number;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 500,
    description: 'Obligatoria cuando el conteo difiere del saldo esperado.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  reason?: string;
}
