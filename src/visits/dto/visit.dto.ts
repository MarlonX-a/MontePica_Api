import { ApiProperty } from '@nestjs/swagger';

export class VisitDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  tableId: string;
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty({ enum: ['open', 'closed'] })
  status: string;
  @ApiProperty({ format: 'date-time' })
  openedAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: Date | null;
  @ApiProperty({ format: 'uuid' })
  openedBy: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  closedBy: string | null;
}
