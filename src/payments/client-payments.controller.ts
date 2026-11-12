import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { PaymentListDto } from './dto/payment-list.dto.js';
import { PaymentPageDto } from './dto/payment-page.dto.js';
import { PaymentResponseDto } from './dto/payment-response.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('Pagos propios')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@Controller('me/payments')
export class ClientPaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar pagos propios.' })
  @ApiOkResponse({ type: PaymentPageDto })
  list(
    @Query() query: PaymentListDto,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.list(query, client.clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar pago propio.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.detail(id, client.clientId);
  }
}
