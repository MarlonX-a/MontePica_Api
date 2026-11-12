import { ApiProperty } from '@nestjs/swagger';

export class TransferReceiptDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'application/pdf'] })
  mime: string;
  @ApiProperty()
  size: number;
  @ApiProperty()
  sha256: string;
}
