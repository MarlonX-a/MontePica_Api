import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { DeliveryService } from './delivery.service.js';
import { AdminDeliveryListDto } from './dto/admin-delivery-list.dto.js';
import { AdminDeliverySettingsResponseDto } from './dto/admin-delivery-settings-response.dto.js';
import { DeliveryEmptyDto } from './dto/delivery-empty.dto.js';
import { DeliveryPageDto } from './dto/delivery-page.dto.js';
import { DeliveryRejectDto } from './dto/delivery-reject.dto.js';
import { DeliveryResponseDto } from './dto/delivery-response.dto.js';
import { DeliverySettingsDto } from './dto/delivery-settings.dto.js';

const idempotency = () =>
  ApiHeader({ name: 'Idempotency-Key', required: true });

@ApiTags('Domicilios administrativos')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
@ApiResponse({ status: 400, description: 'Datos inválidos.' })
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 403, description: 'Falta permiso.' })
@ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
@ApiResponse({ status: 409, description: 'Conflicto operativo.' })
export class AdminDeliveryController {
  constructor(private readonly service: DeliveryService) {}

  @Get('delivery/settings')
  @RequirePermission('delivery.read')
  @ApiOperation({ summary: 'Consultar configuración de domicilios.' })
  @ApiOkResponse({ type: AdminDeliverySettingsResponseDto })
  settings() {
    return this.service.settings();
  }

  @Put('delivery/settings')
  @RequirePermission('delivery.configure')
  @idempotency()
  @ApiOperation({ summary: 'Actualizar configuración versionada.' })
  @ApiOkResponse({ type: AdminDeliverySettingsResponseDto })
  update(
    @Body() dto: DeliverySettingsDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.updateSettings(dto, actor, key);
  }

  @Get('delivery-requests')
  @RequirePermission('delivery.read')
  @ApiOperation({ summary: 'Listar solicitudes.' })
  @ApiOkResponse({ type: DeliveryPageDto })
  list(@Query() query: AdminDeliveryListDto) {
    return this.service.list(query);
  }

  @Get('delivery-requests/:id')
  @RequirePermission('delivery.read')
  @ApiOperation({ summary: 'Consultar solicitud.' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Post('delivery-requests/:id/approve')
  @HttpCode(200)
  @RequirePermission('delivery.review')
  @idempotency()
  @ApiOperation({ summary: 'Aprobar cobertura.' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: DeliveryEmptyDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.transition(
      id,
      'approve',
      actor,
      undefined,
      undefined,
      key,
    );
  }

  @Post('delivery-requests/:id/reject')
  @HttpCode(200)
  @RequirePermission('delivery.review')
  @idempotency()
  @ApiOperation({ summary: 'Rechazar cobertura.' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliveryRejectDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.transition(
      id,
      'reject',
      actor,
      undefined,
      dto.reason,
      key,
    );
  }
}
