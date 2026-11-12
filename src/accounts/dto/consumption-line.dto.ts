import { ApiProperty } from '@nestjs/swagger';

export class ConsumptionLineDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  orderId: string;
  @ApiProperty()
  orderStatus: string;
  @ApiProperty({ format: 'uuid' })
  productId: string;
  @ApiProperty()
  productName: string;
  @ApiProperty()
  quantity: number;
  @ApiProperty()
  unitPriceCents: number;
  @ApiProperty()
  subtotalCents: number;
}
