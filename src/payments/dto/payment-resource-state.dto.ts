import { ApiProperty } from '@nestjs/swagger';

export class PaymentResourceStateDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty()
  status: string;
}
