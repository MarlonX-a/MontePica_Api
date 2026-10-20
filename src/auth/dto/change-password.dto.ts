import { Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @MinLength(1) @MaxLength(128) currentPassword: string;
  @MinLength(8) @MaxLength(128) @Matches(/^(?=.*[A-ZÁÉÍÓÚÜÑ])(?=.*\d).+$/) newPassword: string;
}
