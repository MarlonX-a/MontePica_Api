import { ApiProperty } from '@nestjs/swagger';

export class CashBlockerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty()
  reason: string;
}
