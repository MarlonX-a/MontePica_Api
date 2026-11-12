import { ApiProperty } from '@nestjs/swagger';

export class PointsSettingsResponseDto {
  @ApiProperty()
  enabled: boolean;
  @ApiProperty({ minimum: 1, maximum: 1000 })
  pointsPerDollar: number;
  @ApiProperty()
  version: number;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
