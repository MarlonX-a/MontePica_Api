import { ApiProperty } from '@nestjs/swagger';

export class OperatingDayClosureDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  cashClosureId: string | null;
  @ApiProperty({ format: 'uuid' })
  closedBy: string;
  @ApiProperty({ format: 'date-time' })
  closedAt: Date;
  @ApiProperty({ type: String, nullable: true })
  notes: string | null;
  @ApiProperty({ type: Object })
  summary: Record<string, number>;
  @ApiProperty({ enum: ['USD'] })
  currency: string;
}
