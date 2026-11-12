import { ApiProperty } from '@nestjs/swagger';
import { OrderHistoryDto } from './order-history.dto.js';
import { OrderResponseDto } from './order-response.dto.js';

export class AdminOrderResponseDto extends OrderResponseDto {
  @ApiProperty({ type: [OrderHistoryDto] })
  history: OrderHistoryDto[];
}
