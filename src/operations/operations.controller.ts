import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Query,
  Headers,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto.js';
import { UpdateOperationsSettingsDto } from './dto/update-operations-settings.dto.js';
import { OperationsService } from './operations.service.js';
import { CashSummaryDto } from '../tables/cancellations.dto.js';
import {
  CashClosureResponseDto,
  CashClosingPreviewDto,
  CashClosingPreviewQueryDto,
  CashRegisterPageDto,
  CloseCashRegisterDto,
  ListCashRegistersDto,
} from './dto/cash-register.dto.js';
import {
  CloseOperatingDayDto,
  OperatingDayClosureDto,
  OperatingDayClosingPreviewDto,
  OperatingDayDetailsDto,
  OperatingDayPreviewQueryDto,
  OpenWithPendingDayResponseDto,
  OpenWithPendingDaysDto,
} from './dto/operating-day.dto.js';

@ApiTags('Operación diaria')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin/operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('settings')
  @RequirePermission('operations.read')
  @ApiOperation({ summary: 'Consulta la configuración de operación.' })
  getSettings() {
    return this.operations.getSettings();
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
    return this.operations.updateSettings(dto, actor);
  }

  @Get('current')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary: 'Consulta la jornada y caja de la fecha operativa actual.',
  })
  getCurrent() {
    return this.operations.getCurrent();
  }

  @Get('cash')
  @RequirePermission('operations.read')
  @ApiOperation({ summary: 'Lista cajas actuales e históricas.' })
  @ApiOkResponse({ type: CashRegisterPageDto })
  listCashRegisters(@Query() query: ListCashRegistersDto) {
    return this.operations.listCashRegisters(query);
  }

  @Get('cash/:id/summary')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary:
      'Calcula el saldo de caja desde apertura, cobros en efectivo y devoluciones.',
  })
  @ApiOkResponse({ type: CashSummaryDto })
  getCashSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.getCashSummary(id);
  }

  @Get('cash/:id/closing-preview')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary: 'Muestra el saldo esperado y los bloqueos antes del cierre.',
  })
  @ApiOkResponse({ type: CashClosingPreviewDto })
  closingPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CashClosingPreviewQueryDto,
  ) {
    return this.operations.getCashClosingPreview(id, query);
  }

  @Post('cash/:id/close')
  @HttpCode(200)
  @RequirePermission('operations.closeCash')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    summary: 'Registra el conteo y cierra la caja de forma inmutable.',
  })
  @ApiOkResponse({
    type: CashClosureResponseDto,
    description: 'Conciliación registrada.',
  })
  @ApiResponse({
    status: 409,
    description: 'La caja tiene pendientes o ya fue cerrada.',
  })
  closeCash(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashRegisterDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.operations.closeCash(id, dto, actor, key);
  }

  @Get('cash/:id/closure')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary: 'Consulta la conciliación inmutable de una caja cerrada.',
  })
  @ApiOkResponse({ type: CashClosureResponseDto })
  getCashClosure(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.getCashClosure(id);
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
    return this.operations.openDay(actor);
  }

  @Get('days/:id')
  @RequirePermission('operations.read')
  @ApiOperation({
    summary: 'Consulta una jornada y su estado de caja y cierre.',
  })
  @ApiOkResponse({ type: OperatingDayDetailsDto })
  @ApiResponse({ status: 404, description: 'Jornada no encontrada.' })
  getOperatingDay(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.getOperatingDay(id);
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
    return this.operations.getOperatingDayClosingPreview(id, query);
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
    return this.operations.closeOperatingDay(id, dto, actor, key);
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
    return this.operations.getOperatingDayClosure(id);
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
    return this.operations.openWithPendingDays(dto, actor, key);
  }

  @Post('cash/open')
  @RequirePermission('operations.open')
  @ApiOperation({
    summary:
      'Abre la caja de la jornada actual con un fondo inicial en centavos.',
  })
  @ApiResponse({ status: 201, description: 'Caja abierta.' })
  @ApiResponse({
    status: 409,
    description: 'La jornada no está abierta o ya tiene una caja.',
  })
  openCash(
    @Body() dto: OpenCashRegisterDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.operations.openCash(dto, actor);
  }
}
