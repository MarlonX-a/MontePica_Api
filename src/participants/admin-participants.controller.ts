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
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { ClosedVisitDto } from '../visits/dto/closed-visit.dto.js';
import { VisitPageDto } from '../visits/dto/visit-page.dto.js';
import { VisitDto } from '../visits/dto/visit.dto.js';
import { VisitsQueryDto } from '../visits/dto/visits-query.dto.js';
import { EmptyParticipationBodyDto } from './dto/empty-participation-body.dto.js';
import { ParticipantPageDto } from './dto/participant-page.dto.js';
import { ParticipantQueryDto } from './dto/participant-query.dto.js';
import { ParticipantDto } from './dto/participant.dto.js';
import { RejectParticipationDto } from './dto/reject-participation.dto.js';
import { ParticipantsService } from './participants.service.js';

const idempotencyHeader = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Clave única para reintentos de la operación, de 1 a 128 caracteres.',
  });

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

  @Get('visits')
  @RequirePermission('visits.read')
  @ApiOperation({ summary: 'Listar visitas actuales e históricas.' })
  @ApiOkResponse({ type: VisitPageDto })
  visits(@Query() dto: VisitsQueryDto) {
    return this.service.visits(dto);
  }

  @Get('visits/:id')
  @RequirePermission('visits.read')
  @ApiOperation({ summary: 'Consultar visita.' })
  @ApiOkResponse({ type: VisitDto })
  visit(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.visit(id);
  }

  @Get('visits/:id/participants')
  @RequirePermission('participants.manage')
  @ApiOperation({
    summary: 'Listar solicitudes y participantes de una visita.',
  })
  @ApiOkResponse({ type: ParticipantPageDto })
  participants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: ParticipantQueryDto,
  ) {
    return this.service.participants(dto, { visitId: id });
  }

  @Post('participants/:id/approve')
  @HttpCode(200)
  @RequirePermission('participants.manage')
  @idempotencyHeader()
  @ApiOperation({ summary: 'Aprobar participante y crear cuenta individual.' })
  @ApiOkResponse({ type: ParticipantDto })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Body() _dto: EmptyParticipationBodyDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.transition(id, 'approve', { userId: user.userId }, key);
  }

  @Post('participants/:id/reject')
  @HttpCode(200)
  @RequirePermission('participants.manage')
  @idempotencyHeader()
  @ApiOperation({ summary: 'Rechazar solicitud con motivo.' })
  @ApiOkResponse({ type: ParticipantDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectParticipationDto,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.transition(
      id,
      'reject',
      { userId: user.userId },
      key,
      dto.reason,
    );
  }

  @Post('participants/:id/finish')
  @HttpCode(200)
  @RequirePermission('participants.manage')
  @idempotencyHeader()
  @ApiOperation({ summary: 'Finalizar participación y cerrar cuenta vacía.' })
  @ApiOkResponse({ type: ParticipantDto })
  finish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Body() _dto: EmptyParticipationBodyDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.transition(id, 'finish', { userId: user.userId }, key);
  }

  @Post('visits/:id/close')
  @HttpCode(200)
  @RequirePermission('visits.manage')
  @idempotencyHeader()
  @ApiOperation({ summary: 'Cerrar visita y finalizar sus participantes.' })
  @ApiOkResponse({ type: ClosedVisitDto })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Body() _dto: EmptyParticipationBodyDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.close(id, { userId: user.userId }, key);
  }
}
