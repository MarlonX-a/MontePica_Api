import { ApiProperty } from '@nestjs/swagger';

export class PaymentHistoryDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  userId: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  guestSessionId: string | null;
  @ApiProperty()
  event: string;
  @ApiProperty({ type: String, nullable: true })
  previousStatus: string | null;
  @ApiProperty()
  newStatus: string;
  @ApiProperty({ format: 'date-time' })
  occurredAt: string;
}
