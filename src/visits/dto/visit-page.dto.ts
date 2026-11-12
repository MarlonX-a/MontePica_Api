import { ApiProperty } from '@nestjs/swagger';
import { VisitDto } from './visit.dto.js';

export class VisitPageDto {
  @ApiProperty({ type: [VisitDto] })
  items: VisitDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
