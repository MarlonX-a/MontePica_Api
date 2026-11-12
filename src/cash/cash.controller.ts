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
import { CashService } from './cash.service.js';
import { CashClosingPreviewQueryDto } from './dto/cash-closing-preview-query.dto.js';
import { CashClosingPreviewDto } from './dto/cash-closing-preview.dto.js';
import { CashClosureResponseDto } from './dto/cash-closure-response.dto.js';
import { CashRegisterPageDto } from './dto/cash-register-page.dto.js';
import { CashSummaryDto } from './dto/cash-summary.dto.js';
import { CloseCashRegisterDto } from './dto/close-cash-register.dto.js';
import { ListCashRegistersDto } from './dto/list-cash-registers.dto.js';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto.js';

@ApiTags('Operación diaria')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin/operations')
export class CashController {
  constructor(private readonly service: CashService) {}

  @Get('cash')
  @RequirePermission('operations.read')
  @ApiOperation({
    operationId: 'OperationsController_listCashRegisters',
    summary: 'Lista cajas actuales e históricas.',
  })
  @ApiOkResponse({ type: CashRegisterPageDto })
  listCashRegisters(@Query() query: ListCashRegistersDto) {
    return this.service.listCashRegisters(query);
  }

  @Get('cash/:id/summary')
  @RequirePermission('operations.read')
  @ApiOperation({
    operationId: 'OperationsController_getCashSummary',
    summary:
      'Calcula el saldo de caja desde apertura, cobros en efectivo y devoluciones.',
  })
  @ApiOkResponse({ type: CashSummaryDto })
  getCashSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCashSummary(id);
  }

  @Get('cash/:id/closing-preview')
  @RequirePermission('operations.read')
  @ApiOperation({
    operationId: 'OperationsController_closingPreview',
    summary: 'Muestra el saldo esperado y los bloqueos antes del cierre.',
  })
  @ApiOkResponse({ type: CashClosingPreviewDto })
  closingPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CashClosingPreviewQueryDto,
  ) {
    return this.service.getCashClosingPreview(id, query);
  }

  @Post('cash/:id/close')
  @HttpCode(200)
  @RequirePermission('operations.closeCash')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    operationId: 'OperationsController_closeCash',
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
    return this.service.closeCash(id, dto, actor, key);
  }

  @Get('cash/:id/closure')
  @RequirePermission('operations.read')
  @ApiOperation({
    operationId: 'OperationsController_getCashClosure',
    summary: 'Consulta la conciliación inmutable de una caja cerrada.',
  })
  @ApiOkResponse({ type: CashClosureResponseDto })
  getCashClosure(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCashClosure(id);
  }

  @Post('cash/open')
  @RequirePermission('operations.open')
  @ApiOperation({
    operationId: 'OperationsController_openCash',
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
    return this.service.openCash(dto, actor);
  }
}
