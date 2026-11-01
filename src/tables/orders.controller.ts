import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ClientAccessGuard, CurrentClient, type ClientIdentity } from './client-access.guard.js';
import { AdminOrderQueryDto, AdminOrderResponseDto, CancelOrderDto, CreateOrderDto, EditOrderDto, OrderPageDto, OrderQueryDto, OrderResponseDto, OrderTransitionDto } from './orders.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Pedidos del cliente') @ApiBearerAuth('client-token') @UseGuards(ClientAccessGuard) @Controller()
@ApiResponse({ status: 400, description: 'Datos inválidos.' }) @ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' }) @ApiResponse({ status: 409, description: 'Conflicto de estado o inventario.' })
export class ClientOrdersController {
  constructor(private readonly service: OrdersService) {}
  @Post('visits/:id/orders') @ApiOperation({ summary: 'Enviar pedido y reservar inventario.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiCreatedResponse({ description: 'Pedido creado.', type: OrderResponseDto })
  create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateOrderDto, @CurrentClient() client: ClientIdentity, @Headers('idempotency-key') key?: string) { return this.service.create(id, dto, client, key); }
  @Get('me/orders') @ApiOkResponse({ description: 'Pedidos propios paginados.', type: OrderPageDto })
  list(@Query() query: OrderQueryDto, @CurrentClient() client: ClientIdentity) { return this.service.list(query, client.clientId); }
  @Get('me/orders/:id') @ApiOkResponse({ description: 'Detalle del pedido propio.', type: OrderResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentClient() client: ClientIdentity) { return this.service.detail(id, client.clientId); }
  @Get('me/orders/:id/history') @ApiOkResponse({description:'Versiones e historial propios.'})
  history(@Param('id', ParseUUIDPipe) id:string, @CurrentClient() client:ClientIdentity) { return this.service.history(id,client.clientId); }
  @Put('me/orders/:id') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOkResponse({type:OrderResponseDto})
  edit(@Param('id', ParseUUIDPipe) id:string, @Body() dto:EditOrderDto, @CurrentClient() client:ClientIdentity, @Headers('idempotency-key') key?:string) { return this.service.edit(id,dto,client,key); }
  @Post('me/orders/:id/cancel') @HttpCode(200) @ApiHeader({ name:'Idempotency-Key', required:true })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto, @CurrentClient() client: ClientIdentity, @Headers('idempotency-key') key?: string) { return this.service.transition(id,'cancel',dto,client.guestSessionId ? {guestSessionId:client.guestSessionId}:{userId:client.userId},client,key); }
}

@ApiTags('Pedidos administrativos') @ApiBearerAuth('access-token') @UseGuards(AuthAccessGuard, PermissionsGuard) @Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly service: OrdersService) {}
  @Get() @RequirePermission('orders.read') @ApiOkResponse({ description: 'Pedidos paginados; requiere orders.read.', type: OrderPageDto })
  list(@Query() query: AdminOrderQueryDto) { return this.service.list(query); }
  @Get(':id') @RequirePermission('orders.read') @ApiOkResponse({ description: 'Pedido e historial; requiere orders.read.', type: AdminOrderResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.detail(id, undefined, true); }
  @Get(':id/history') @RequirePermission('orders.read') @ApiOkResponse({description:'Versiones e historial del pedido.'})
  history(@Param('id', ParseUUIDPipe) id:string) { return this.service.history(id); }
  @Post(':id/start-preparation') @HttpCode(200) @RequirePermission('orders.manage') @ApiHeader({name:'Idempotency-Key',required:true})
  start(@Param('id', ParseUUIDPipe) id:string, @Body() dto:OrderTransitionDto, @CurrentUserContext() user:AuthenticatedRequestContext, @Headers('idempotency-key') key?:string) { return this.service.transition(id,'start-preparation',dto,{userId:user.userId},undefined,key); }
  @Post(':id/ready') @HttpCode(200) @RequirePermission('orders.manage') @ApiHeader({name:'Idempotency-Key',required:true})
  ready(@Param('id', ParseUUIDPipe) id:string, @Body() dto:OrderTransitionDto, @CurrentUserContext() user:AuthenticatedRequestContext, @Headers('idempotency-key') key?:string) { return this.service.transition(id,'ready',dto,{userId:user.userId},undefined,key); }
  @Post(':id/deliver') @HttpCode(200) @RequirePermission('orders.manage') @ApiHeader({name:'Idempotency-Key',required:true})
  deliver(@Param('id', ParseUUIDPipe) id:string, @Body() dto:OrderTransitionDto, @CurrentUserContext() user:AuthenticatedRequestContext, @Headers('idempotency-key') key?:string) { return this.service.transition(id,'deliver',dto,{userId:user.userId},undefined,key); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('orders.manage') @ApiHeader({name:'Idempotency-Key',required:true})
  cancel(@Param('id', ParseUUIDPipe) id:string, @Body() dto:CancelOrderDto, @CurrentUserContext() user:AuthenticatedRequestContext, @Headers('idempotency-key') key?:string) { return this.service.transition(id,'cancel',dto,{userId:user.userId},undefined,key); }
}
