import { ApiProperty } from '@nestjs/swagger';

export class OperatingDayDetailsDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'date' })
  businessDate: string;
  @ApiProperty({ enum: ['open', 'closed'] })
  status: string;
  @ApiProperty({ format: 'date-time' })
  openedAt: Date;
  @ApiProperty({ format: 'uuid' })
  openedBy: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  closureId: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: Date | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  closedBy: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  cashRegisterId: string | null;
  @ApiProperty({ type: String, nullable: true })
  cashStatus: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  cashClosureId: string | null;
}
