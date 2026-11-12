import { ApiProperty } from '@nestjs/swagger';

export class TableDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty()
  code: string;
  @ApiProperty()
  active: boolean;
}
