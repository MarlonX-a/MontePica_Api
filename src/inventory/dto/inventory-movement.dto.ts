import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export const inventoryMovementTypes = ['restock', 'internalConsumption', 'giveaway', 'waste'] as const;
export type InventoryMovementType = (typeof inventoryMovementTypes)[number];

export class CreateInventoryMovementDto {
  @ApiProperty({ enum: inventoryMovementTypes })
  @IsIn(inventoryMovementTypes)
  type: InventoryMovementType;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity: number;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class CreateInventoryAdjustmentDto {
  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  countedQuantity: number;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;
}
