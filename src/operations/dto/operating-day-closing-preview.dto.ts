import { ApiProperty } from '@nestjs/swagger';
import { OperatingDayBlockerDto } from './operating-day-blocker.dto.js';

export class OperatingDayClosingPreviewDto {
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty()
  canClose: boolean;
  @ApiProperty({ type: Object })
  counts: Record<string, number>;
  @ApiProperty({ type: [OperatingDayBlockerDto] })
  blockers: OperatingDayBlockerDto[];
  @ApiProperty()
  totalBlockers: number;
  @ApiProperty({ default: 1 })
  page: number;
  @ApiProperty({ default: 20 })
  limit: number;
  @ApiProperty({ type: Object })
  cleanupActions: Record<string, number>;
  @ApiProperty()
  pendingRefunds: { total: number; amountCents: number };
  @ApiProperty({ enum: ['USD'] })
  currency: string;
}
