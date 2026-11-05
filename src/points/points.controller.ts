import { PointsBalanceDto,PointsSettingsResponseDto,PointsMovementPageDto } from './points-response.dto.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiTags,
  ApiProperty,
  ApiPropertyOptional,
  ApiOkResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import {
  ClientAccessGuard,
  CurrentClient,
  type ClientIdentity,
} from '../tables/client-access.guard.js';
import { PointsService } from './points.service.js';
import { IsIn, IsUUID } from 'class-validator';
class PointsConfigDto {
  @ApiProperty() @IsBoolean() enabled: boolean;
  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  pointsPerDollar: number;
}
class PointsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ enum: ['earn', 'refundAdjustment', 'redeem', 'redemptionReturn'] })
  @IsIn(['earn', 'refundAdjustment', 'redeem', 'redemptionReturn'])
  type?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  paymentId?: string;
}
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
  @ApiOkResponse({type:PointsSettingsResponseDto})
  @Get('points/settings')
  settings() {
    return this.points.publicSettings();
  }
  @ApiOkResponse({type:PointsSettingsResponseDto})
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
  @ApiOkResponse({type:PointsSettingsResponseDto})
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
  @ApiOkResponse({type:PointsBalanceDto})
  @Get('me/points')
  @UseGuards(ClientAccessGuard)
  @ApiBearerAuth('client-token')
  me(@CurrentClient() c: ClientIdentity) {
    if (!c.userId)
      throw new UnauthorizedException('Se requiere una cuenta registrada.');
    return this.points.balance(c.clientId);
  }
  @ApiOkResponse({type:PointsMovementPageDto})
  @Get('me/points/movements')
  @UseGuards(ClientAccessGuard)
  @ApiBearerAuth('client-token')
  movements(@CurrentClient() c: ClientIdentity, @Query() q: PointsQueryDto) {
    if (!c.userId)
      throw new UnauthorizedException('Se requiere una cuenta registrada.');
    return this.points.movements(c.clientId, q);
  }
  @ApiOkResponse({type:PointsBalanceDto})
  @Get('admin/clients/:id/points')
  @UseGuards(AuthAccessGuard, PermissionsGuard)
  @RequirePermission('points.read')
  @ApiBearerAuth('access-token')
  client(@Param('id', ParseUUIDPipe) id: string) {
    return this.points.balance(id);
  }
  @ApiOkResponse({type:PointsMovementPageDto})
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
