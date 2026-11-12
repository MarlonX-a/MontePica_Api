import { ApiProperty } from '@nestjs/swagger';

export class OpenVisitDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ enum: ['open'] })
  status: string;
  @ApiProperty({ format: 'date-time' })
  openedAt: Date;
}
