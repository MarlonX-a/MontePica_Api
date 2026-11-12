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
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { SettlementCancelDto } from './dto/settlement-cancel.dto.js';
import { SettlementEmptyDto } from './dto/settlement-empty.dto.js';
import { SettlementListDto } from './dto/settlement-list.dto.js';
import { SettlementPageDto } from './dto/settlement-page.dto.js';
import { SettlementResponseDto } from './dto/settlement-response.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('Cuentas y liquidaciones administrativas')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
@ApiResponse({ status: 400, description: 'Datos inválidos.' })
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 403, description: 'Falta permiso.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' })
@ApiResponse({ status: 409, description: 'Conflicto operativo.' })
export class AdminSettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Post('accounts/:id/settlements')
  @RequirePermission('settlements.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Preparar liquidación completa.' })
  @ApiCreatedResponse({ type: SettlementResponseDto })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _body: SettlementEmptyDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.create(id, actor, key);
  }

  @Get('settlements')
  @RequirePermission('settlements.read')
  @ApiOperation({ summary: 'Listar liquidaciones.' })
  @ApiOkResponse({ type: SettlementPageDto })
  settlements(@Query() query: SettlementListDto) {
    return this.service.settlements(query);
  }

  @Get('settlements/:id')
  @RequirePermission('settlements.read')
  @ApiOperation({ summary: 'Consultar liquidación.' })
  @ApiOkResponse({ type: SettlementResponseDto })
  settlement(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.settlement(id);
  }

  @Post('settlements/:id/cancel')
  @HttpCode(200)
  @RequirePermission('settlements.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Anular liquidación pendiente.' })
  @ApiOkResponse({ type: SettlementResponseDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SettlementCancelDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.cancel(id, dto.reason, actor, key);
  }
}
