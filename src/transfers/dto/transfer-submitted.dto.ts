import { ApiProperty } from '@nestjs/swagger';
import { TransferReceiptDto } from './transfer-receipt.dto.js';

export class TransferSubmittedDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  settlementId: string;
  @ApiProperty({ enum: ['transfer'] })
  method: string;
  @ApiProperty({ enum: ['pendingVerification'] })
  status: string;
  @ApiProperty()
  amountCents: number;
  @ApiProperty({ type: TransferReceiptDto })
  receipt: TransferReceiptDto;
}
