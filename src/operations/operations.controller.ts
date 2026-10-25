import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto.js';
import { UpdateOperationsSettingsDto } from './dto/update-operations-settings.dto.js';
import { OperationsService } from './operations.service.js';

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
  @ApiOperation({ summary: 'Actualiza zona horaria y horario habitual del negocio.' })
  updateSettings(@Body() dto: UpdateOperationsSettingsDto, @CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.operations.updateSettings(dto, actor);
  }

  @Get('current')
  @RequirePermission('operations.read')
  @ApiOperation({ summary: 'Consulta la jornada y caja de la fecha operativa actual.' })
  getCurrent() {
    return this.operations.getCurrent();
  }

  @Post('days/open')
  @RequirePermission('operations.open')
  @ApiOperation({ summary: 'Abre la jornada correspondiente a la fecha local del negocio.' })
  @ApiResponse({ status: 201, description: 'Jornada abierta.' })
  @ApiResponse({ status: 409, description: 'Ya existe una jornada para esa fecha.' })
  openDay(@CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.operations.openDay(actor);
  }

  @Post('cash/open')
  @RequirePermission('operations.open')
  @ApiOperation({ summary: 'Abre la caja de la jornada actual con un fondo inicial en centavos.' })
  @ApiResponse({ status: 201, description: 'Caja abierta.' })
  @ApiResponse({ status: 409, description: 'La jornada no está abierta o ya tiene una caja.' })
  openCash(@Body() dto: OpenCashRegisterDto, @CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.operations.openCash(dto, actor);
  }
}
