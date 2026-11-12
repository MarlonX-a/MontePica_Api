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
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto.js';
import { AdminOrderResponseDto } from './dto/admin-order-response.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { OrderPageDto } from './dto/order-page.dto.js';
import { OrderTransitionDto } from './dto/order-transition.dto.js';
import { OrdersEditingService } from './orders-editing.service.js';
import { OrdersLifecycleService } from './orders-lifecycle.service.js';
import { OrdersQueryService } from './orders-query.service.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Pedidos administrativos')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly service: OrdersService,
    private readonly editing: OrdersEditingService,
    private readonly lifecycle: OrdersLifecycleService,
    private readonly queries: OrdersQueryService,
  ) {}

  @Get()
  @RequirePermission('orders.read')
  @ApiOkResponse({
    description: 'Pedidos paginados; requiere orders.read.',
    type: OrderPageDto,
  })
  list(@Query() query: AdminOrderQueryDto) {
    return this.queries.list(query);
  }

  @Get(':id')
  @RequirePermission('orders.read')
  @ApiOkResponse({
    description: 'Pedido e historial; requiere orders.read.',
    type: AdminOrderResponseDto,
  })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.queries.detail(id, undefined, true);
  }

  @Get(':id/history')
  @RequirePermission('orders.read')
  @ApiOkResponse({ description: 'Versiones e historial del pedido.' })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.queries.history(id);
  }

  @Post(':id/start-preparation')
  @HttpCode(200)
  @RequirePermission('orders.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderTransitionDto,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.lifecycle.transition(
      id,
      'start-preparation',
      dto,
      user,
      undefined,
      key,
    );
  }

  @Post(':id/dispatch')
  @HttpCode(200)
  @RequirePermission('orders.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  dispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderTransitionDto,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.lifecycle.transition(id, 'dispatch', dto, user, undefined, key);
  }

  @Post(':id/ready')
  @HttpCode(200)
  @RequirePermission('orders.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  ready(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderTransitionDto,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.lifecycle.transition(id, 'ready', dto, user, undefined, key);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  @RequirePermission('orders.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderTransitionDto,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.lifecycle.transition(id, 'deliver', dto, user, undefined, key);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('orders.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUserContext() user: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.lifecycle.transition(id, 'cancel', dto, user, undefined, key);
  }
}
