import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateAdminProductDto {
  @ApiProperty({ example: 'ceviche-mixto' }) @IsString() @MinLength(1) @MaxLength(80) sku: string;
  @ApiProperty({ example: 'Ceviche mixto' }) @IsString() @MinLength(1) @MaxLength(180) name: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Opcional temporalmente para pruebas.' }) @IsOptional() @IsUUID() categoryId?: string;
  @ApiProperty({ example: 950, minimum: 0 }) @IsInt() @Min(0) @Max(2147483647) priceCents: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uri' }) @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048) imageUrl?: string | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() visibleInMenu?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() tracksInventory?: boolean;
  @ApiPropertyOptional({ default: 0, minimum: 0 }) @IsOptional() @IsInt() @Min(0) @Max(2147483647) sortOrder?: number;
}
export class UpdateAdminProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(180) name?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) @Max(2147483647) priceCents?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uri' }) @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048) imageUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visibleInMenu?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() tracksInventory?: boolean;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) @Max(2147483647) sortOrder?: number;
}
export class VisibilityDto {
  @ApiProperty({ example: false }) @IsBoolean() visibleInMenu: boolean;
}
