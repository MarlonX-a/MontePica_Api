import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { CloseOperatingDayDto } from './dto/close-operating-day.dto.js';
import { OpenWithPendingDayResponseDto } from './dto/open-with-pending-day-response.dto.js';
import { OpenWithPendingDaysDto } from './dto/open-with-pending-days.dto.js';
import { OperatingDayClosingPreviewDto } from './dto/operating-day-closing-preview.dto.js';
import { OperatingDayClosureDto } from './dto/operating-day-closure.dto.js';
import { OperatingDayDetailsDto } from './dto/operating-day-details.dto.js';
import { OperatingDayPreviewQueryDto } from './dto/operating-day-preview-query.dto.js';
import { UpdateOperationsSettingsDto } from './dto/update-operations-settings.dto.js';
import { OperatingDayClosureService } from './operating-day-closure.service.js';
import { OperatingDaysService } from './operating-days.service.js';
import { OperationsSettingsService } from './operations-settings.service.js';

@ApiTags('Operación diaria')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin/operations')
export class OperationsController {
  constructor(
    private readonly settings: OperationsSettingsService,
    private readonly days: OperatingDaysService,
    private readonly closures: OperatingDayClosureService,
  ) {}

  @Get('settings')
  @RequirePermission('operations.read')
  @ApiOperation({ summary: 'Consulta la configuración de operación.' })
  getSettings() {
    return this.settings.getSettings();
  }

  @Patch('settings')
  @RequirePermission('operations.manage')
  @ApiOperation({
    summary: 'Actualiza zona horaria y horario habitual del negocio.',
  })
  updateSettings(
    @Body() dto: UpdateOperationsSettingsDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.settings.updateSettings(dto, actor);
  }

  @Get('current')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary: 'Consulta la jornada y caja de la fecha operativa actual.',
  })
  getCurrent() {
    return this.days.getCurrent();
  }

  @Post('days/open')
  @RequirePermission('operations.open')
  @ApiOperation({
    summary: 'Abre la jornada correspondiente a la fecha local del negocio.',
  })
  @ApiResponse({ status: 201, description: 'Jornada abierta.' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una jornada para esa fecha.',
  })
  openDay(@CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.days.openDay(actor);
  }

  @Get('days/:id')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary: 'Consulta una jornada y su estado de caja y cierre.',
  })
  @ApiOkResponse({ type: OperatingDayDetailsDto })
  @ApiResponse({ status: 404, description: 'Jornada no encontrada.' })
  getOperatingDay(@Param('id', ParseUUIDPipe) id: string) {
    return this.days.getOperatingDay(id);
  }

  @Get('days/:id/closing-preview')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary: 'Muestra bloqueos y limpiezas previstas para cerrar una jornada.',
  })
  @ApiOkResponse({ type: OperatingDayClosingPreviewDto })
  closingPreviewOperatingDay(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OperatingDayPreviewQueryDto,
  ) {
    return this.closures.getOperatingDayClosingPreview(id, query);
  }

  @Post('days/:id/close')
  @HttpCode(200)
  @RequirePermission('operations.closeDay')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    summary:
      'Resuelve limpiezas pendientes y cierra la jornada de forma inmutable.',
  })
  @ApiOkResponse({ type: OperatingDayClosureDto })
  @ApiResponse({
    status: 409,
    description: 'La jornada conserva pendientes o ya fue cerrada.',
  })
  closeOperatingDay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseOperatingDayDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.closures.closeOperatingDay(id, dto, actor, key);
  }

  @Get('days/:id/closure')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary: 'Consulta el registro histórico de cierre de la jornada.',
  })
  @ApiOkResponse({ type: OperatingDayClosureDto })
  @ApiResponse({
    status: 404,
    description: 'La jornada todavía no tiene cierre.',
  })
  getOperatingDayClosure(@Param('id', ParseUUIDPipe) id: string) {
    return this.closures.getOperatingDayClosure(id);
  }

  @Post('days/open-with-pending-days')
  @RequirePermission('operations.openWithPendingDays')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    summary:
      'Abre la fecha actual con una justificación para recuperar jornadas previas.',
  })
  @ApiCreatedResponse({
    type: OpenWithPendingDayResponseDto,
    description: 'Jornada actual abierta con excepción auditada.',
  })
  @ApiResponse({
    status: 409,
    description: 'No hay jornadas previas abiertas o ya existe jornada actual.',
  })
  openWithPendingDays(
    @Body() dto: OpenWithPendingDaysDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.days.openWithPendingDays(dto, actor, key);
  }
}
