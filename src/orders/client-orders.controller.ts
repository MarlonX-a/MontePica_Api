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
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { EditOrderDto } from './dto/edit-order.dto.js';
import { OrderPageDto } from './dto/order-page.dto.js';
import { OrderQueryDto } from './dto/order-query.dto.js';
import { OrderResponseDto } from './dto/order-response.dto.js';
import { OrdersEditingService } from './orders-editing.service.js';
import { OrdersLifecycleService } from './orders-lifecycle.service.js';
import { OrdersQueryService } from './orders-query.service.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Pedidos del cliente')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@Controller()
@ApiResponse({ status: 400, description: 'Datos inválidos.' })
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' })
@ApiResponse({ status: 409, description: 'Conflicto de estado o inventario.' })
export class ClientOrdersController {
  constructor(
    private readonly service: OrdersService,
    private readonly editing: OrdersEditingService,
    private readonly lifecycle: OrdersLifecycleService,
    private readonly queries: OrdersQueryService,
  ) {}

  @Post('visits/:id/orders')
  @ApiOperation({ summary: 'Enviar pedido y reservar inventario.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ description: 'Pedido creado.', type: OrderResponseDto })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrderDto,
    @CurrentClient() client: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.create(id, dto, client, key);
  }

  @Get('me/orders')
  @ApiOkResponse({
    description: 'Pedidos propios paginados.',
    type: OrderPageDto,
  })
  list(@Query() query: OrderQueryDto, @CurrentClient() client: ClientIdentity) {
    return this.queries.list(query, client.clientId);
  }

  @Get('me/orders/:id')
  @ApiOkResponse({
    description: 'Detalle del pedido propio.',
    type: OrderResponseDto,
  })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.queries.detail(id, client.clientId);
  }

  @Get('me/orders/:id/history')
  @ApiOkResponse({ description: 'Versiones e historial propios.' })
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.queries.history(id, client.clientId);
  }

  @Put('me/orders/:id')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: OrderResponseDto })
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditOrderDto,
    @CurrentClient() client: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.editing.edit(id, dto, client, key);
  }

  @Post('me/orders/:id/cancel')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentClient() client: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.lifecycle.transition(
      id,
      'cancel',
      dto,
      client.guestSessionId
        ? { guestSessionId: client.guestSessionId }
        : { userId: client.userId },
      client,
      key,
    );
  }
}
