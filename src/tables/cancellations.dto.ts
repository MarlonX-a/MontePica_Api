import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  IsOptional,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CancellationCreateDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion: number;
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 500)
  reason: string;
}
export class CancellationReasonDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 500)
  reason: string;
}
export class CancellationEmptyDto {}
export class CancellationListDto {
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
  @ApiPropertyOptional({
    enum: ['pending', 'approved', 'rejected', 'withdrawn'],
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['pending', 'approved', 'rejected', 'withdrawn'])
  status?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  orderId?: string;
}
export class AdminCancellationListDto extends CancellationListDto {
  @ApiPropertyOptional({ enum: ['local', 'delivery'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['local', 'delivery'])
  modality?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  operatingDayId?: string;
}
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

@ValidatorConstraint({ name: 'refundMethodFields', async: false })
class RefundMethodFieldsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const dto = args.object as RefundExecutionDto;
    return dto.method === 'cash'
      ? typeof dto.recipientName === 'string' && dto.bankOperationReference === undefined
      : typeof dto.bankOperationReference === 'string' && dto.recipientName === undefined;
  }
  defaultMessage() {
    return 'Envía únicamente los campos que corresponden al método seleccionado.';
  }
}

export class RefundExecutionDto {
  @ApiProperty({ enum: ['cash', 'transfer'] })
  @IsIn(['cash', 'transfer'])
  @Validate(RefundMethodFieldsConstraint)
  method: 'cash' | 'transfer';

  @ApiPropertyOptional({ minLength: 1, maxLength: 120, description: 'Obligatoria para transferencias.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.normalize('NFC').trim().toLocaleUpperCase('es') : value)
  @IsString()
  @Length(1, 120)
  bankOperationReference?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 160, description: 'Obligatorio para efectivo.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 160)
  recipientName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(0, 500)
  notes?: string;

}

export class RefundResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) cancellationRequestId: string;
  @ApiProperty({ format: 'uuid' }) orderId: string;
  @ApiProperty({ format: 'uuid' }) paymentId: string;
  @ApiProperty({
    description: 'Importe autorizado pendiente de entregar, en centavos.',
  })
  amountCents: number;
  @ApiProperty({ enum: ['pending', 'completed'] }) status: string;
  @ApiProperty({ enum: ['USD'] }) currency: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiPropertyOptional({ enum: ['cash', 'transfer'], nullable: true }) method?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) executedAt?: string | null;
  @ApiPropertyOptional({ type: 'integer', nullable: true }) refundedCents?: number;
}
export class AdminRefundResponseDto extends RefundResponseDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) executedBy?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) cashRegisterId?: string | null;
  @ApiPropertyOptional({ nullable: true }) bankOperationReference?: string | null;
  @ApiPropertyOptional({ nullable: true }) recipientName?: string | null;
  @ApiPropertyOptional({ nullable: true }) notes?: string | null;
  @ApiPropertyOptional({ type: 'array', items: { type: 'object', additionalProperties: true } }) history?: Record<string, unknown>[];
}
export class CancellationResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) orderId: string;
  @ApiProperty({ format: 'uuid' }) operatingDayId: string;
  @ApiProperty({ format: 'uuid' }) versionId: string;
  @ApiProperty({ enum: ['local', 'delivery'] }) modality: string;
  @ApiProperty() orderStatus: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'withdrawn'] })
  status: string;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) rejectionReason: string | null;
  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  refund?: Record<string, unknown> | null;
}
export class AdminCancellationResponseDto extends CancellationResponseDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) requestedBy:
    string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) decidedBy:
    string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  history: Record<string, unknown>[];
}
export class CancellationPageDto {
  @ApiProperty({ type: [CancellationResponseDto] })
  items: CancellationResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
export class AdminCancellationPageDto extends CancellationPageDto {
  @ApiProperty({ type: [AdminCancellationResponseDto] })
  declare items: AdminCancellationResponseDto[];
}
export class RefundPageDto {
  @ApiProperty({ type: [RefundResponseDto] }) items: RefundResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
export class AdminRefundPageDto extends RefundPageDto {
  @ApiProperty({ type: [AdminRefundResponseDto] })
  declare items: AdminRefundResponseDto[];
}

export class CashSummaryDto {
  @ApiProperty({ format: 'uuid' }) cashRegisterId: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status: string;
  @ApiProperty({ type: 'integer' }) openingCents: number;
  @ApiProperty({ type: 'integer' }) cashIncomeCents: number;
  @ApiProperty({ type: 'integer' }) cashRefundsCents: number;
  @ApiProperty({ type: 'integer' }) balanceCents: number;
  @ApiProperty({ type: 'integer', description: 'Transferencias confirmadas, separadas del efectivo físico.' }) confirmedTransferCents: number;
  @ApiProperty({ type: Object, nullable: true }) closure: { id: string; closedAt: string; closedBy: string; countedCents: number; differenceCents: number; reason: string | null } | null;
  @ApiProperty({ enum: ['USD'] }) currency: string;
}
