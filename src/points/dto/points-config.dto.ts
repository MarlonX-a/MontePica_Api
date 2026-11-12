import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class PointsConfigDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  pointsPerDollar: number;
}
