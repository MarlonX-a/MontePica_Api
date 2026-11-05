import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CloseOperatingDayDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  notes?: string;
}

export class OpenWithPendingDaysDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  reason: string;
}

export class OperatingDayPreviewQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class OperatingDayClosureDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) operatingDayId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) cashClosureId:
    string | null;
  @ApiProperty({ format: 'uuid' }) closedBy: string;
  @ApiProperty({ format: 'date-time' }) closedAt: Date;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ type: Object }) summary: Record<string, number>;
  @ApiProperty({ enum: ['USD'] }) currency: string;
}

export class OperatingDayDetailsDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date' }) businessDate: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status: string;
  @ApiProperty({ format: 'date-time' }) openedAt: Date;
  @ApiProperty({ format: 'uuid' }) openedBy: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) closureId:
    string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: Date | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) closedBy:
    string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  cashRegisterId: string | null;
  @ApiProperty({ type: String, nullable: true }) cashStatus: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) cashClosureId:
    string | null;
}

export class OpenWithPendingDayResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date' }) businessDate: string;
  @ApiProperty({ enum: ['open'] }) status: string;
  @ApiProperty({ format: 'date-time' }) openedAt: Date;
  @ApiProperty({ format: 'uuid' }) openedBy: string;
  @ApiProperty({ type: Object })
  exceptionalOpening: {
    reason: string;
    pendingOperatingDayIds: string[];
  };
}

export class OperatingDayBlockerDto {
  @ApiProperty() kind: string;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() reason: string;
}

export class OperatingDayClosingPreviewDto {
  @ApiProperty({ format: 'uuid' }) operatingDayId: string;
  @ApiProperty() canClose: boolean;
  @ApiProperty({ type: Object }) counts: Record<string, number>;
  @ApiProperty({ type: [OperatingDayBlockerDto] })
  blockers: OperatingDayBlockerDto[];
  @ApiProperty() totalBlockers: number;
  @ApiProperty({ default: 1 }) page: number;
  @ApiProperty({ default: 20 }) limit: number;
  @ApiProperty({ type: Object }) cleanupActions: Record<string, number>;
  @ApiProperty() pendingRefunds: { total: number; amountCents: number };
  @ApiProperty({ enum: ['USD'] }) currency: string;
}
