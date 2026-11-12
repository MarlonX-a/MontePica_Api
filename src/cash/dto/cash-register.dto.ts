import { ApiProperty } from '@nestjs/swagger';

export class CashRegisterDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  operatingDayId: string;
  @ApiProperty({ enum: ['open', 'closed'] })
  status: string;
  @ApiProperty()
  openingCents: number;
  @ApiProperty({ format: 'date-time' })
  openedAt: string;
  @ApiProperty({ format: 'uuid' })
  openedBy: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  closureId: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  closedAt: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  closedBy: string | null;
  @ApiProperty({ type: Number, nullable: true })
  expectedCents: number | null;
  @ApiProperty({ type: Number, nullable: true })
  countedCents: number | null;
  @ApiProperty({ type: Number, nullable: true })
  differenceCents: number | null;
}
