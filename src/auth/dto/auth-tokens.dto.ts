import { ApiProperty } from '@nestjs/swagger';
import { AuthUserDto } from './auth-user.dto.js';

export class AuthTokensDto {
  @ApiProperty({ writeOnly: true })
  accessToken: string;

  @ApiProperty({ writeOnly: true })
  refreshToken: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType: 'Bearer';

  @ApiProperty({ example: 900 })
  expiresIn: number;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}
