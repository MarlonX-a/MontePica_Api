import { ApiProperty } from '@nestjs/swagger';
import { AuthRoleDto } from './auth-role.dto.js';

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
