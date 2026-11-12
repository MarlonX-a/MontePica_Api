import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTableDto {
  @ApiProperty({ example: 'M01', maxLength: 40 })
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  code: string;
}
