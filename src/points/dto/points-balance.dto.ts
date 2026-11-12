import { ApiProperty } from '@nestjs/swagger';

export class PointsBalanceDto {
  @ApiProperty({ type: 'integer' })
  balance: number;
  @ApiProperty({ type: 'integer' })
  pendingPoints: number;
  @ApiProperty({ type: 'integer' })
  reservedPoints: number;
  @ApiProperty({ type: 'integer' })
  availablePoints: number;
}
