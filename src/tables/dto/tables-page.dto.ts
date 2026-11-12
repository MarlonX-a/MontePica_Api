import { ApiProperty } from '@nestjs/swagger';
import { ListedTableDto } from './listed-table.dto.js';

export class TablesPageDto {
  @ApiProperty({ type: [ListedTableDto] })
  items: ListedTableDto[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
}
