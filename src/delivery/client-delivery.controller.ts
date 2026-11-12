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
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { RegisteredClientGuard } from '../common/identity/registered-client.guard.js';
import { CreateOrderDto } from '../orders/dto/create-order.dto.js';
import { OrderResponseDto } from '../orders/dto/order-response.dto.js';
import { OrdersService } from '../orders/orders.service.js';
import { DeliveryService } from './delivery.service.js';
import { DeliveryEmptyDto } from './dto/delivery-empty.dto.js';
import { DeliveryListDto } from './dto/delivery-list.dto.js';
import { DeliveryPageDto } from './dto/delivery-page.dto.js';
import { DeliveryRequestDto } from './dto/delivery-request.dto.js';
import { DeliveryResponseDto } from './dto/delivery-response.dto.js';

const idempotency = () =>
  ApiHeader({ name: 'Idempotency-Key', required: true });

@ApiTags('Solicitudes de domicilio')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard, RegisteredClientGuard)
@Controller('me/delivery-requests')
@ApiResponse({ status: 400, description: 'Datos inválidos.' })
@ApiResponse({
  status: 401,
  description: 'Se requiere sesión de cliente registrado.',
})
@ApiResponse({
  status: 403,
  description: 'El personal no puede usar esta ruta.',
})
@ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
@ApiResponse({ status: 409, description: 'Conflicto operativo.' })
export class ClientDeliveryController {
  constructor(
    private readonly service: DeliveryService,
    private readonly orders: OrdersService,
  ) {}

  @Post(':id/orders')
  @idempotency()
  @ApiOperation({ summary: 'Crear domicilio con liquidación y reservas.' })
  @ApiCreatedResponse({ type: OrderResponseDto })
  order(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrderDto,
    @CurrentClient() client: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.createDelivery(id, dto, client, key);
  }

  @Post()
  @idempotency()
  @ApiOperation({ summary: 'Solicitar revisión de cobertura.' })
  @ApiCreatedResponse({ type: DeliveryResponseDto })
  create(
    @Body() dto: DeliveryRequestDto,
    @CurrentClient() client: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.create(dto, client, key);
  }

  @Get()
  @ApiOperation({ summary: 'Consultar solicitudes propias.' })
  @ApiOkResponse({ type: DeliveryPageDto })
  list(
    @Query() query: DeliveryListDto,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.list(query, client.clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar solicitud propia.' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.detail(id, client.clientId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @idempotency()
  @ApiOperation({ summary: 'Cancelar solicitud propia.' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: DeliveryEmptyDto,
    @CurrentClient() client: ClientIdentity,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.transition(id, 'cancel', actor, client, undefined, key);
  }
}
