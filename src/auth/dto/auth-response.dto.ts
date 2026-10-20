import { ApiProperty } from '@nestjs/swagger';

export class AuthRoleDto {
  @ApiProperty({ enum: ['admin', 'worker', 'client'] })
  code: string;

  @ApiProperty()
  name: string;
}

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: AuthRoleDto })
  role: AuthRoleDto;

  @ApiProperty({ format: 'uuid', nullable: true })
  clientId: string | null;

  @ApiProperty({ type: [String], example: ['catalog.read'] })
  permissions: string[];
}

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
