import { ApiProperty } from '@nestjs/swagger';

export class OperatingDayBlockerDto {
  @ApiProperty()
  kind: string;
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty()
  reason: string;
}
