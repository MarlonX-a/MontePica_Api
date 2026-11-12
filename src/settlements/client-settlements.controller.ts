import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { SettlementResponseDto } from './dto/settlement-response.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('Cuentas del cliente')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@Controller('me')
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' })
export class ClientSettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get('settlements/:id')
  @ApiOperation({ summary: 'Consultar liquidación propia.' })
  @ApiOkResponse({ type: SettlementResponseDto })
  settlement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.settlement(id, client.clientId);
  }
}
