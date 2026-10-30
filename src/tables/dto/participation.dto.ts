import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class EmptyParticipationBodyDto {}

export class RequestParticipationDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString() @Length(1, 128) qrToken: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(trim) @IsString() @Length(1, 80) alias: string;
}

export class RejectParticipationDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trim) @IsString() @Length(1, 500) reason: string;
}

export class ParticipantQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'cancelled', 'finished'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['pending', 'approved', 'rejected', 'cancelled', 'finished']) status?: string;
}

export class VisitsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() tableId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() operatingDayId?: string;

  @ApiPropertyOptional({ enum: ['open', 'closed'] })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(['open', 'closed']) status?: string;
}

export class UpdateTableDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 40 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim) @IsString() @Length(1, 40) code?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() active?: boolean;
}

export class ConsumptionAccountDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status: string;
  @ApiProperty({ enum: ['local'] }) modality: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) closedAt: Date | null;
}

export class ParticipantDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) visitId: string;
  @ApiProperty({ format: 'uuid' }) clientId: string;
  @ApiProperty() alias: string;
  @ApiProperty({ enum: ['pending','approved','rejected','cancelled','finished'] }) status: string;
  @ApiProperty({ type: Number, nullable: true }) requestedQrVersion: number | null;
  @ApiProperty({ format: 'date-time' }) requestedAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) approvedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) finishedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) rejectionReason: string | null;
  @ApiProperty({ type: ConsumptionAccountDto, nullable: true }) account: ConsumptionAccountDto | null;
}

export class ParticipantPageDto {
  @ApiProperty({ type: [ParticipantDto] }) items: ParticipantDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class VisitDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) tableId: string;
  @ApiProperty({ format: 'uuid' }) operatingDayId: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status: string;
  @ApiProperty({ format: 'date-time' }) openedAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) closedAt: Date | null;
  @ApiProperty({ format: 'uuid' }) openedBy: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) closedBy: string | null;
}

export class VisitPageDto {
  @ApiProperty({ type: [VisitDto] }) items: VisitDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class ClosedVisitDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['closed'] }) status: string;
  @ApiProperty({ format: 'date-time' }) closedAt: Date;
}
