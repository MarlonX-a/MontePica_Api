import { ApiProperty } from '@nestjs/swagger';
import { DeliverySettingsResponseDto } from './delivery-settings-response.dto.js';

export class AdminDeliverySettingsResponseDto extends DeliverySettingsResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  configuredBy: string | null;
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
