import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class OpenCashRegisterDto {
  @ApiProperty({ example: 5000, minimum: 0, maximum: 2147483647, description: 'Fondo inicial en centavos de USD.' })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  openingAmountCents: number;
}
