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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { EmptyParticipationBodyDto } from './dto/empty-participation-body.dto.js';
import { ParticipantPageDto } from './dto/participant-page.dto.js';
import { ParticipantQueryDto } from './dto/participant-query.dto.js';
import { ParticipantDto } from './dto/participant.dto.js';
import { RequestParticipationDto } from './dto/request-participation.dto.js';
import { ParticipantsService } from './participants.service.js';

const clientActor = (client: ClientIdentity) =>
  client.guestSessionId
    ? { guestSessionId: client.guestSessionId }
    : { userId: client.userId };

const idempotencyHeader = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Clave única para reintentos de la operación, de 1 a 128 caracteres.',
  });

@ApiTags('Participación en mesas')
@ApiBearerAuth('client-token')
@ApiResponse({ status: 400, description: 'Datos, UUID o clave inválidos.' })
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 403, description: 'Se requiere identidad de cliente.' })
@ApiResponse({ status: 404, description: 'Recurso o QR no encontrado.' })
@ApiResponse({ status: 409, description: 'Conflicto de estado o clave.' })
@UseGuards(ClientAccessGuard)
@Controller()
export class ClientParticipantsController {
  constructor(private readonly service: ParticipantsService) {}

  @Post('visits/:id/participants')
  @idempotencyHeader()
  @ApiOperation({ summary: 'Solicitar ingreso mediante QR.' })
  @ApiCreatedResponse({ type: ParticipantDto })
  request(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestParticipationDto,
    @CurrentClient() client: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.request(id, dto, client, key);
  }

  @Get('me/participants')
  @ApiOperation({ summary: 'Listar participaciones propias.' })
  @ApiOkResponse({ type: ParticipantPageDto })
  list(
    @Query() dto: ParticipantQueryDto,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.participants(dto, { clientId: client.clientId });
  }

  @Get('me/participants/:id')
  @ApiOperation({ summary: 'Consultar participación y cuenta propias.' })
  @ApiOkResponse({ type: ParticipantDto })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.detail(id, client);
  }

  @Post('me/participants/:id/leave')
  @HttpCode(200)
  @idempotencyHeader()
  @ApiOperation({ summary: 'Cancelar solicitud o finalizar participación.' })
  @ApiOkResponse({ type: ParticipantDto })
  leave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
    @Body() _dto: EmptyParticipationBodyDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.transition(
      id,
      'leave',
      clientActor(client),
      key,
      undefined,
      client,
    );
  }
}
