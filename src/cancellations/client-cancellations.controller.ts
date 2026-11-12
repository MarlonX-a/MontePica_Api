import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { CancellationsService } from './cancellations.service.js';
import { CancellationCreateDto } from './dto/cancellation-create.dto.js';
import { CancellationEmptyDto } from './dto/cancellation-empty.dto.js';
import { CancellationListDto } from './dto/cancellation-list.dto.js';
import { CancellationPageDto } from './dto/cancellation-page.dto.js';
import { CancellationResponseDto } from './dto/cancellation-response.dto.js';

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
export class ClientCancellationsController {
  constructor(private readonly service: CancellationsService) {}

  @Post('orders/:id/cancellation-requests')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: CancellationResponseDto })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CancellationCreateDto,
    @CurrentClient() c: ClientIdentity,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.create(
      id,
      d,
      c.guestSessionId
        ? { guestSessionId: c.guestSessionId }
        : { userId: c.userId },
      c,
      k,
    );
  }

  @Get('cancellation-requests')
  @ApiOkResponse({ type: CancellationPageDto })
  list(@Query() q: CancellationListDto, @CurrentClient() c: ClientIdentity) {
    return this.service.list(q, c.clientId);
  }

  @Get('cancellation-requests/:id')
  @ApiOkResponse({ type: CancellationResponseDto })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() c: ClientIdentity,
  ) {
    return this.service.detail(id, c.clientId);
  }

  @Post('cancellation-requests/:id/withdraw')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: CancellationResponseDto })
  withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _d: CancellationEmptyDto,
    @CurrentClient() c: ClientIdentity,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.decide(
      id,
      'withdraw',
      { userId: c.userId ?? '', sessionId: c.userSessionId ?? '' },
      c,
      undefined,
      k,
    );
  }
}
