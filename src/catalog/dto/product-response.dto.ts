import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductCategoryResponseDto } from './product-category-response.dto.js';

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

  @ApiProperty({ type: ProductCategoryResponseDto })
  category: ProductCategoryResponseDto;

  @ApiProperty()
  tracksInventory: boolean;

  @ApiProperty({ minimum: 0 })
  sortOrder: number;
}
