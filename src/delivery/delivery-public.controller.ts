import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service.js';
import { DeliverySettingsResponseDto } from './dto/delivery-settings-response.dto.js';

@ApiTags('Domicilios')
@Controller('delivery')
export class DeliveryPublicController {
  constructor(private readonly service: DeliveryService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Consultar cobertura y tarifa vigente.' })
  @ApiOkResponse({ type: DeliverySettingsResponseDto })
  async settings() {
    const {
      version,
      enabled,
      coverageDescription,
      shippingFeeCents,
      currency,
      receiptSubmissionSeconds,
    } = await this.service.settings();
    return {
      version,
      enabled,
      coverageDescription,
      shippingFeeCents,
      currency,
      receiptSubmissionSeconds,
    };
  }
}
