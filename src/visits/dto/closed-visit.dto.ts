import { ApiProperty } from '@nestjs/swagger';

export class ClosedVisitDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ enum: ['closed'] })
  status: string;
  @ApiProperty({ format: 'date-time' })
  closedAt: Date;
}
