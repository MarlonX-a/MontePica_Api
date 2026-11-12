import { ApiProperty } from '@nestjs/swagger';
import { OrderResponseDto } from './order-response.dto.js';

export class OrderPageDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items: OrderResponseDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
