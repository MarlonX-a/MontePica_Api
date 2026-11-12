import { ApiProperty } from '@nestjs/swagger';
import { ConsumptionAccountDto } from '../../accounts/dto/consumption-account.dto.js';

export class ParticipantDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  visitId: string;
  @ApiProperty({ format: 'uuid' })
  clientId: string;
  @ApiProperty()
  alias: string;
  @ApiProperty({
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'finished'],
  })
  status: string;
  @ApiProperty({ type: Number, nullable: true })
  requestedQrVersion: number | null;
  @ApiProperty({ format: 'date-time' })
  requestedAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  approvedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt: Date | null;
  @ApiProperty({ type: String, nullable: true })
  rejectionReason: string | null;
  @ApiProperty({ type: ConsumptionAccountDto, nullable: true })
  account: ConsumptionAccountDto | null;
}
