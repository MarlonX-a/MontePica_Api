import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsString, Length, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'María Zambrano', maxLength: 160 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 160)
  name: string;

  @ApiProperty({ example: 'maria@example.com', maxLength: 320 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: '0987654321' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[+()\d\s-]+$/)
  phone: string;

  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(8, 128)
  @Matches(/[A-ZÁÉÍÓÚÑ]/, { message: 'La contraseña debe incluir una mayúscula.' })
  @Matches(/\d/, { message: 'La contraseña debe incluir un número.' })
  password: string;

  @ApiProperty({ enum: [true] })
  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los términos y políticas de privacidad.' })
  termsAccepted: true;
}
