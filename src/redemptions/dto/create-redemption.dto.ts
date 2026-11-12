import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateRedemptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  rewardId: string;
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  rewardVersion: number;
}
