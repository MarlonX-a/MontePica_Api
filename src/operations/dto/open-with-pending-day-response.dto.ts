import { ApiProperty } from '@nestjs/swagger';

export class OpenWithPendingDayResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'date' })
  businessDate: string;
  @ApiProperty({ enum: ['open'] })
  status: string;
  @ApiProperty({ format: 'date-time' })
  openedAt: Date;
  @ApiProperty({ format: 'uuid' })
  openedBy: string;
  @ApiProperty({ type: Object })
  exceptionalOpening: {
    reason: string;
    pendingOperatingDayIds: string[];
  };
}
