import { ApiProperty } from '@nestjs/swagger';
import { PointsMovementDto } from './points-movement.dto.js';

export class PointsMovementPageDto {
  @ApiProperty({ type: [PointsMovementDto] })
  items: PointsMovementDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
