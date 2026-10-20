import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'María Zambrano' }) @IsString() @MinLength(1) @MaxLength(160) name: string;
  @ApiProperty({ example: 'maria@example.com', format: 'email' }) @IsEmail() @MaxLength(320) email: string;
  @ApiProperty({ enum: ['admin', 'worker', 'client'] }) @IsIn(['admin', 'worker', 'client']) roleCode: string;
  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true }) @IsString() @MinLength(8) @MaxLength(128) @Matches(/^(?=.*[A-ZÁÉÍÓÚÜÑ])(?=.*\d).+$/) initialPassword: string;
  @ApiPropertyOptional({ example: '+593987654321' }) @IsOptional() @IsString() @Matches(/^[+\d\s()-]{10,18}$/) phone?: string;
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @ApiPropertyOptional({ format: 'email' }) @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @ApiPropertyOptional({ enum: ['admin', 'worker', 'client'] }) @IsOptional() @IsIn(['admin', 'worker', 'client']) roleCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @Matches(/^[+\d\s()-]{10,18}$/) phone?: string | null;
}
