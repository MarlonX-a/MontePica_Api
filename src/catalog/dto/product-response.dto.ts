import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  sku: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ minimum: 0, description: 'Precio expresado en centavos.' })
  priceCents: number;

  @ApiProperty({ enum: ['USD'] })
  currency: 'USD';

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  imageUrl: string | null;

  @ApiProperty({ type: ProductCategoryResponseDto, nullable: true })
  category: ProductCategoryResponseDto | null;

  @ApiProperty()
  tracksInventory: boolean;

  @ApiProperty({ minimum: 0 })
  sortOrder: number;
}

export class PaginatedProductsResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items: ProductResponseDto[];

  @ApiProperty({ minimum: 0 })
  total: number;

  @ApiProperty({ minimum: 1 })
  page: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit: number;
}
