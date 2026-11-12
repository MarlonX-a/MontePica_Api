import { ApiProperty } from '@nestjs/swagger';

export class AuthRoleDto {
  @ApiProperty({ enum: ['admin', 'worker', 'client'] })
  code: string;

  @ApiProperty()
  name: string;
}
