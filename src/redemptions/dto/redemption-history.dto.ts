import { ApiProperty } from '@nestjs/swagger';

export class RedemptionHistoryDto {
  @ApiProperty()
  event: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  actorUserId: string | null;
  @ApiProperty()
  detail: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' })
  occurredAt: string;
}
