import { ApiProperty } from '@nestjs/swagger';
import { ParticipantDto } from './participant.dto.js';

export class ParticipantPageDto {
  @ApiProperty({ type: [ParticipantDto] })
  items: ParticipantDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
