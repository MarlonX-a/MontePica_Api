import { ApiProperty } from '@nestjs/swagger';
import { CashBlockerListDto } from './cash-blocker-list.dto.js';

export class CashClosingPreviewDto {
  @ApiProperty({ format: 'uuid' })
  cashRegisterId: string;
  @ApiProperty({ enum: ['open', 'closed'] })
  status: string;
  @ApiProperty()
  openingCents: number;
  @ApiProperty()
  cashIncomeCents: number;
  @ApiProperty()
  cashRefundsCents: number;
  @ApiProperty()
  expectedCents: number;
  @ApiProperty()
  confirmedTransferCents: number;
  @ApiProperty()
  canClose: boolean;
  @ApiProperty({ type: Object })
  blockers: Record<string, CashBlockerListDto>;
  @ApiProperty({ type: Object })
  pendingRefunds: {
    total: number;
    amountCents: number;
  };
  @ApiProperty({ enum: ['USD'] })
  currency: string;
}
