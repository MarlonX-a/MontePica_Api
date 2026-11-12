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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { RefundListDto } from './dto/refund-list.dto.js';
import { RefundPageDto } from './dto/refund-page.dto.js';
import { RefundResponseDto } from './dto/refund-response.dto.js';
import { RefundsService } from './refunds.service.js';

@ApiTags('Cancelaciones y devoluciones')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@ApiResponse({ status: 400, description: 'Datos invalidos.' })
@ApiResponse({ status: 401, description: 'Sesion invalida.' })
@ApiResponse({ status: 404, description: 'Recurso ajeno o inexistente.' })
@ApiResponse({
  status: 409,
  description: 'Estado, version o clave en conflicto.',
})
@Controller('me')
export class ClientRefundsController {
  constructor(private readonly service: RefundsService) {}

  @ApiOperation({
    operationId: 'ClientCancellationsController_refund',
    summary: undefined,
  })
  @Get('refunds/:id')
  @ApiOkResponse({ type: RefundResponseDto })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() c: ClientIdentity,
  ) {
    return this.service.refund(id, c.clientId);
  }

  @ApiOperation({
    operationId: 'ClientCancellationsController_refunds',
    summary: undefined,
  })
  @Get('refunds')
  @ApiOkResponse({ type: RefundPageDto })
  refunds(@Query() q: RefundListDto, @CurrentClient() c: ClientIdentity) {
    return this.service.refunds(q, c.clientId);
  }
}
