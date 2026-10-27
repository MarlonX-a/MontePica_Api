import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CreateInventoryAdjustmentDto, CreateInventoryMovementDto } from './dto/inventory-movement.dto.js';
import { InitializeInventoryDto } from './dto/initialize-inventory.dto.js';
import {
  ListInventoryMovementsQueryDto,
  ListInventoryQueryDto,
  ListOperatingDaysQueryDto,
} from './dto/list-inventory-query.dto.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('Inventario diario')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('operating-days')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Lista las jornadas operativas más recientes.' })
  listOperatingDays(@Query() query: ListOperatingDaysQueryDto) {
    return this.inventory.listOperatingDays(query);
  }

  @Get('operating-days/:dayId/inventory/movements')
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'dayId', format: 'uuid' })
  @ApiQuery({ name: 'productId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'type', required: false, enum: ['initialization', 'restock', 'internalConsumption', 'giveaway', 'waste', 'adjustment'] })
  @ApiOperation({ summary: 'Consulta el historial de movimientos de una jornada.' })
  listMovements(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Query() query: ListInventoryMovementsQueryDto,
  ) {
    return this.inventory.listMovements(dayId, query);
  }

  @Post('operating-days/:dayId/inventory/initialize')
  @RequirePermission('inventory.initialize')
  @ApiParam({ name: 'dayId', format: 'uuid' })
  @ApiOperation({ summary: 'Inicializa uno o varios productos para la jornada.' })
  @ApiCreatedResponse({ description: 'Existencias inicializadas; cada producto tiene un movimiento inicial.' })
  @ApiConflictResponse({ description: 'La jornada no está abierta, o un producto ya fue inicializado.' })
  initialize(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: InitializeInventoryDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.inventory.initialize(dayId, dto, idempotencyKey, actor);
  }

  @Get('operating-days/:dayId/inventory')
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'dayId', format: 'uuid' })
  @ApiOperation({ summary: 'Lista existencias inicializadas y productos pendientes.' })
  listInventory(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Query() query: ListInventoryQueryDto,
  ) {
    return this.inventory.listInventory(dayId, query);
  }

  @Get('operating-days/:dayId/inventory/:productId')
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'dayId', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiNotFoundResponse({ description: 'Jornada o producto no encontrado.' })
  @ApiOperation({ summary: 'Consulta la existencia de un producto en una jornada.' })
  getInventoryItem(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.inventory.getInventoryItem(dayId, productId);
  }

  @Post('operating-days/:dayId/inventory/:productId/movements')
  @RequirePermission('inventory.move')
  @ApiParam({ name: 'dayId', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOperation({ summary: 'Registra una entrada o salida de existencias.' })
  @ApiCreatedResponse({ description: 'Movimiento e inventario actualizados.' })
  @ApiConflictResponse({ description: 'Saldo insuficiente, jornada cerrada o clave idempotente conflictiva.' })
  createMovement(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateInventoryMovementDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.inventory.createMovement(dayId, productId, dto, idempotencyKey, actor);
  }

  @Post('operating-days/:dayId/inventory/:productId/adjustments')
  @RequirePermission('inventory.adjust')
  @ApiParam({ name: 'dayId', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOperation({ summary: 'Ajusta las existencias con el conteo físico.' })
  @ApiCreatedResponse({ description: 'Ajuste e inventario actualizados.' })
  @ApiConflictResponse({ description: 'Conteo inferior a lo reservado, jornada cerrada o clave idempotente conflictiva.' })
  adjust(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateInventoryAdjustmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.inventory.adjust(dayId, productId, dto, idempotencyKey, actor);
  }
}
