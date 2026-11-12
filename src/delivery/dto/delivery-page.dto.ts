import { ApiProperty } from '@nestjs/swagger';
import { DeliveryResponseDto } from './delivery-response.dto.js';

export class DeliveryPageDto {
  @ApiProperty({ type: [DeliveryResponseDto] })
  items: DeliveryResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
