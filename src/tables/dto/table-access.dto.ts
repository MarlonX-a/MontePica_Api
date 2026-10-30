import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateGuestSessionDto {
  @ApiProperty({ example: 'María', minLength: 1, maxLength: 160 })
  @Transform(trim) @IsString() @Length(1, 160) name: string;

  @ApiPropertyOptional({ maxLength: 20, example: '0987654321' })
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim) @IsString() @MaxLength(20) phone?: string;
}

export class ResolveTableQrDto {
  @ApiProperty({ description: 'Token opaco entregado al emitir el QR.', minLength: 1, maxLength: 128 })
  @IsString() @Length(1, 128) qrToken: string;
}

export class CreateTableDto {
  @ApiProperty({ example: 'M01', maxLength: 40 })
  @Transform(trim) @IsString() @Length(1, 40) code: string;
}

export class ListTablesDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class GuestClientDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
}

export class GuestSessionDto {
  @ApiProperty({ type: GuestClientDto }) client: GuestClientDto;
  @ApiProperty({ description: 'Token guest_ de 24 horas. Solo se entrega al crear la sesión.' }) token: string;
  @ApiProperty({ format: 'uuid' }) sessionId: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
}

export class ResolvedTableQrDto {
  @ApiProperty({ format: 'uuid' }) visitId: string;
  @ApiProperty({ format: 'uuid' }) tableId: string;
  @ApiProperty() tableCode: string;
  @ApiProperty({ minimum: 1 }) qrVersion: number;
}

export class IssuedTableQrDto {
  @ApiProperty({ format: 'uuid' }) visitId: string;
  @ApiProperty({ description: 'Secreto de un solo retorno; al emitir otro se invalida el anterior.' }) qrToken: string;
  @ApiProperty({ minimum: 1 }) qrVersion: number;
}

export class OpenVisitDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['open'] }) status: string;
  @ApiProperty({ format: 'date-time' }) openedAt: Date;
}

export class TableDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() active: boolean;
}

export class ListedTableDto extends TableDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) openVisitId: string | null;
}

export class TablesPageDto {
  @ApiProperty({ type: [ListedTableDto] }) items: ListedTableDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
