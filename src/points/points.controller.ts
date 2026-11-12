import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { PointsBalanceDto } from './dto/points-balance.dto.js';
import { PointsConfigDto } from './dto/points-config.dto.js';
import { PointsMovementPageDto } from './dto/points-movement-page.dto.js';
import { PointsQueryDto } from './dto/points-query.dto.js';
import { PointsSettingsResponseDto } from './dto/points-settings-response.dto.js';
import { PointsService } from './points.service.js';

@ApiTags('Puntos')
@ApiResponse({ status: 400, description: 'Datos inválidos.' })
@ApiResponse({ status: 401, description: 'Sesión registrada requerida.' })
@ApiResponse({ status: 403, description: 'Permiso insuficiente.' })
@ApiResponse({ status: 404, description: 'Cliente inexistente.' })
@ApiResponse({
  status: 409,
  description: 'Conflicto o desbordamiento de puntos.',
})
@ApiOkResponse({
  description: 'Configuración, saldo o historial de puntos según el recurso.',
})
@Controller()
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        enabled: { type: 'boolean' },
        pointsPerDollar: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOkResponse({ type: PointsSettingsResponseDto })
  @Get('points/settings')
  settings() {
    return this.points.publicSettings();
  }

  @ApiOkResponse({ type: PointsSettingsResponseDto })
  @Put('admin/points/settings')
  @UseGuards(AuthAccessGuard, PermissionsGuard)
  @RequirePermission('points.configure')
  @ApiBearerAuth('access-token')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  configure(
    @Body() d: PointsConfigDto,
    @CurrentUserContext() a: AuthenticatedRequestContext,
    @Headers('idempotency-key') k: string,
  ) {
    return this.points.configure(d.enabled, d.pointsPerDollar, a, k);
  }

  @ApiOkResponse({ type: PointsSettingsResponseDto })
  @Get('admin/points/settings')
  @UseGuards(AuthAccessGuard, PermissionsGuard)
  @RequirePermission('points.read')
  @ApiBearerAuth('access-token')
  adminSettings() {
    return this.points.current();
  }

  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        balance: { type: 'integer' },
        pendingPoints: { type: 'integer' },
      },
    },
  })
  @ApiOkResponse({ type: PointsBalanceDto })
  @Get('me/points')
  @UseGuards(ClientAccessGuard)
  @ApiBearerAuth('client-token')
  me(@CurrentClient() c: ClientIdentity) {
    if (!c.userId)
      throw new UnauthorizedException('Se requiere una cuenta registrada.');
    return this.points.balance(c.clientId);
  }

  @ApiOkResponse({ type: PointsMovementPageDto })
  @Get('me/points/movements')
  @UseGuards(ClientAccessGuard)
  @ApiBearerAuth('client-token')
  movements(@CurrentClient() c: ClientIdentity, @Query() q: PointsQueryDto) {
    if (!c.userId)
      throw new UnauthorizedException('Se requiere una cuenta registrada.');
    return this.points.movements(c.clientId, q);
  }

  @ApiOkResponse({ type: PointsBalanceDto })
  @Get('admin/clients/:id/points')
  @UseGuards(AuthAccessGuard, PermissionsGuard)
  @RequirePermission('points.read')
  @ApiBearerAuth('access-token')
  client(@Param('id', ParseUUIDPipe) id: string) {
    return this.points.balance(id);
  }

  @ApiOkResponse({ type: PointsMovementPageDto })
  @Get('admin/clients/:id/points/movements')
  @UseGuards(AuthAccessGuard, PermissionsGuard)
  @RequirePermission('points.read')
  @ApiBearerAuth('access-token')
  clientMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PointsQueryDto,
  ) {
    return this.points.movements(id, q);
  }
}
