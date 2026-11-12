import { ApiProperty } from '@nestjs/swagger';
import { TableDto } from './table.dto.js';

export class ListedTableDto extends TableDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  openVisitId: string | null;
}
