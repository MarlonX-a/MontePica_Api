import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { InitializeInventoryItemDto } from './initialize-inventory-item.dto.js';

export class InitializeInventoryDto {
  @ApiProperty({
    type: [InitializeInventoryItemDto],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((item: InitializeInventoryItemDto) => item.productId)
  @ValidateNested({ each: true })
  @Type(() => InitializeInventoryItemDto)
  items: InitializeInventoryItemDto[];
}
