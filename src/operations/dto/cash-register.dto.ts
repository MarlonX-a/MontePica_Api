import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

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

export class ListCashRegistersDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional({ enum: ['open', 'closed'] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['open', 'closed'])
  status?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  operatingDayId?: string;
}

export class CashClosingPreviewQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CashClosureResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) cashRegisterId: string;
  @ApiProperty({ format: 'uuid' }) closedBy: string;
  @ApiProperty({ format: 'date-time' }) closedAt: string;
  @ApiProperty() openingCents: number;
  @ApiProperty() cashIncomeCents: number;
  @ApiProperty() cashRefundsCents: number;
  @ApiProperty() expectedCents: number;
  @ApiProperty() countedCents: number;
  @ApiProperty() differenceCents: number;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ enum: ['USD'] }) currency: string;
}

export class CashRegisterDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) operatingDayId: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status: string;
  @ApiProperty() openingCents: number;
  @ApiProperty({ format: 'date-time' }) openedAt: string;
  @ApiProperty({ format: 'uuid' }) openedBy: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) closureId:
    string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) closedAt:
    string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) closedBy:
    string | null;
  @ApiProperty({ type: Number, nullable: true }) expectedCents: number | null;
  @ApiProperty({ type: Number, nullable: true }) countedCents: number | null;
  @ApiProperty({ type: Number, nullable: true }) differenceCents: number | null;
}

export class CashRegisterPageDto {
  @ApiProperty({ type: [CashRegisterDto] }) items: CashRegisterDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class CashBlockerDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() reason: string;
}

export class CashBlockerListDto {
  @ApiProperty({ type: [CashBlockerDto] }) items: CashBlockerDto[];
  @ApiProperty() total: number;
  @ApiProperty({ default: 1 }) page: number;
  @ApiProperty({ default: 100 }) limit: number;
}

export class CashClosingPreviewDto {
  @ApiProperty({ format: 'uuid' }) cashRegisterId: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status: string;
  @ApiProperty() openingCents: number;
  @ApiProperty() cashIncomeCents: number;
  @ApiProperty() cashRefundsCents: number;
  @ApiProperty() expectedCents: number;
  @ApiProperty() confirmedTransferCents: number;
  @ApiProperty() canClose: boolean;
  @ApiProperty({ type: Object }) blockers: Record<string, CashBlockerListDto>;
  @ApiProperty({ type: Object }) pendingRefunds: {
    total: number;
    amountCents: number;
  };
  @ApiProperty({ enum: ['USD'] }) currency: string;
}
