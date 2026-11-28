import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class PushDeviceDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/)
  expoPushToken: string;
}
