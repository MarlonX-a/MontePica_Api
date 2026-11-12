import { ApiProperty } from '@nestjs/swagger';

export class RewardResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty({ type: String, nullable: true })
  description: string | null;
  @ApiProperty({ format: 'uuid' })
  productId: string;
  @ApiProperty()
  productName: string;
  @ApiProperty()
  productPriceCents: number;
  @ApiProperty()
  tracksInventory: boolean;
  @ApiProperty()
  pointsCost: number;
  @ApiProperty()
  active: boolean;
  @ApiProperty()
  sortOrder: number;
  @ApiProperty()
  version: number;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
