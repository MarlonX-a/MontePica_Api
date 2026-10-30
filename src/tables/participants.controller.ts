import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ClientAccessGuard, CurrentClient, type ClientIdentity } from './client-access.guard.js';
import { ClosedVisitDto, EmptyParticipationBodyDto, ParticipantDto, ParticipantPageDto, ParticipantQueryDto, RejectParticipationDto, RequestParticipationDto, VisitDto, VisitPageDto, VisitsQueryDto } from './dto/participation.dto.js';
import { ParticipantsService } from './participants.service.js';

const clientActor = (client: ClientIdentity) => client.guestSessionId ? { guestSessionId: client.guestSessionId } : { userId: client.userId };
const idempotencyHeader = () => ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Clave única para reintentos de la operación, de 1 a 128 caracteres.' });

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

  @Post('visits/:id/participants') @idempotencyHeader()
  @ApiOperation({ summary: 'Solicitar ingreso mediante QR.' })
  @ApiCreatedResponse({ type: ParticipantDto })
  request(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestParticipationDto,
    @CurrentClient() client: ClientIdentity, @Headers('idempotency-key') key?: string) { return this.service.request(id, dto, client, key); }

  @Get('me/participants')
  @ApiOperation({ summary: 'Listar participaciones propias.' })
  @ApiOkResponse({ type: ParticipantPageDto })
  list(@Query() dto: ParticipantQueryDto, @CurrentClient() client: ClientIdentity) { return this.service.participants(dto, { clientId: client.clientId }); }

  @Get('me/participants/:id')
  @ApiOperation({ summary: 'Consultar participación y cuenta propias.' })
  @ApiOkResponse({ type: ParticipantDto })
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentClient() client: ClientIdentity) { return this.service.detail(id, client); }

  @Post('me/participants/:id/leave') @HttpCode(200) @idempotencyHeader()
  @ApiOperation({ summary: 'Cancelar solicitud o finalizar participación.' })
  @ApiOkResponse({ type: ParticipantDto })
  leave(@Param('id', ParseUUIDPipe) id: string, @CurrentClient() client: ClientIdentity, @Body() _dto: EmptyParticipationBodyDto, @Headers('idempotency-key') key?: string) {
    return this.service.transition(id, 'leave', clientActor(client), key, undefined, client);
  }
}

@ApiTags('Participantes y visitas administrativas')
@ApiBearerAuth('access-token')
@ApiResponse({ status: 400, description: 'Datos, UUID o clave inválidos.' })
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 403, description: 'Falta permiso.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' })
@ApiResponse({ status: 409, description: 'Conflicto de estado o clave.' })
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class AdminParticipantsController {
  constructor(private readonly service: ParticipantsService) {}

  @Get('visits') @RequirePermission('visits.read')
  @ApiOperation({ summary: 'Listar visitas actuales e históricas.' })
  @ApiOkResponse({ type: VisitPageDto })
  visits(@Query() dto: VisitsQueryDto) { return this.service.visits(dto); }

  @Get('visits/:id') @RequirePermission('visits.read')
  @ApiOperation({ summary: 'Consultar visita.' })
  @ApiOkResponse({ type: VisitDto })
  visit(@Param('id', ParseUUIDPipe) id: string) { return this.service.visit(id); }

  @Get('visits/:id/participants') @RequirePermission('participants.manage')
  @ApiOperation({ summary: 'Listar solicitudes y participantes de una visita.' })
  @ApiOkResponse({ type: ParticipantPageDto })
  participants(@Param('id', ParseUUIDPipe) id: string, @Query() dto: ParticipantQueryDto) { return this.service.participants(dto, { visitId: id }); }

  @Post('participants/:id/approve') @HttpCode(200) @RequirePermission('participants.manage') @idempotencyHeader()
  @ApiOperation({ summary: 'Aprobar participante y crear cuenta individual.' })
  @ApiOkResponse({ type: ParticipantDto })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUserContext() user: AuthenticatedRequestContext, @Body() _dto: EmptyParticipationBodyDto, @Headers('idempotency-key') key?: string) {
    return this.service.transition(id, 'approve', { userId: user.userId }, key);
  }

  @Post('participants/:id/reject') @HttpCode(200) @RequirePermission('participants.manage') @idempotencyHeader()
  @ApiOperation({ summary: 'Rechazar solicitud con motivo.' })
  @ApiOkResponse({ type: ParticipantDto })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectParticipationDto, @CurrentUserContext() user: AuthenticatedRequestContext, @Headers('idempotency-key') key?: string) {
    return this.service.transition(id, 'reject', { userId: user.userId }, key, dto.reason);
  }

  @Post('participants/:id/finish') @HttpCode(200) @RequirePermission('participants.manage') @idempotencyHeader()
  @ApiOperation({ summary: 'Finalizar participación y cerrar cuenta vacía.' })
  @ApiOkResponse({ type: ParticipantDto })
  finish(@Param('id', ParseUUIDPipe) id: string, @CurrentUserContext() user: AuthenticatedRequestContext, @Body() _dto: EmptyParticipationBodyDto, @Headers('idempotency-key') key?: string) {
    return this.service.transition(id, 'finish', { userId: user.userId }, key);
  }

  @Post('visits/:id/close') @HttpCode(200) @RequirePermission('visits.manage') @idempotencyHeader()
  @ApiOperation({ summary: 'Cerrar visita y finalizar sus participantes.' })
  @ApiOkResponse({ type: ClosedVisitDto })
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUserContext() user: AuthenticatedRequestContext, @Body() _dto: EmptyParticipationBodyDto, @Headers('idempotency-key') key?: string) {
    return this.service.close(id, { userId: user.userId }, key);
  }
}
