import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export const inventoryMovementTypes = [
  'restock',
  'internalConsumption',
  'giveaway',
  'waste',
] as const;

export type InventoryMovementType = (typeof inventoryMovementTypes)[number];

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
