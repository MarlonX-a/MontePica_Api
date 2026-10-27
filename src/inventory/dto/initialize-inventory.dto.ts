import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InitializeInventoryItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  initialQuantity: number;
}

export class InitializeInventoryDto {
  @ApiProperty({ type: [InitializeInventoryItemDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((item: InitializeInventoryItemDto) => item.productId)
  @ValidateNested({ each: true })
  @Type(() => InitializeInventoryItemDto)
  items: InitializeInventoryItemDto[];
}
