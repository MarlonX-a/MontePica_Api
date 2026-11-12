import { ApiProperty } from '@nestjs/swagger';

export class OrderDetailItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  productId: string;
  @ApiProperty()
  quantity: number;
  @ApiProperty()
  unitPriceCents: number;
  @ApiProperty()
  subtotalCents: number;
  @ApiProperty()
  tracksInventory: boolean;
  @ApiProperty({ type: String, nullable: true })
  notes: string | null;
}
