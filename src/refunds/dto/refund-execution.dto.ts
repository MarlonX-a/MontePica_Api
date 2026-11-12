import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Validate } from 'class-validator';
import { RefundMethodFieldsConstraint } from '../../cancellations/validators/refund-method-fields.constraint.js';

export class RefundExecutionDto {
  @ApiProperty({ enum: ['cash', 'transfer'] })
  @IsIn(['cash', 'transfer'])
  @Validate(RefundMethodFieldsConstraint)
  method: 'cash' | 'transfer';

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 120,
    description: 'Obligatoria para transferencias.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().toLocaleUpperCase('es')
      : value,
  )
  @IsString()
  @Length(1, 120)
  bankOperationReference?: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 160,
    description: 'Obligatorio para efectivo.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 160)
  recipientName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(0, 500)
  notes?: string;
}
