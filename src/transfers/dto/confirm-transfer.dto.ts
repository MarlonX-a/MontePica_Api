import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class ConfirmTransferDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().toUpperCase()
      : value,
  )
  @IsString()
  @Length(1, 120)
  bankOperationReference: string;
}
