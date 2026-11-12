import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class VisibilityDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  visibleInMenu: boolean;
}
