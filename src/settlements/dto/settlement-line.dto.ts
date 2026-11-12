import { ApiProperty } from '@nestjs/swagger';

export class SettlementLineDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  assignmentId: string;
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
  @ApiProperty()
  active: boolean;
}
