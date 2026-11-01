import { Body, CanActivate, Controller, ExecutionContext, Get, Headers, HttpCode, Injectable, Param, ParseUUIDPipe, Post, Put, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ClientAccessGuard, CurrentClient, type ClientIdentity } from './client-access.guard.js';
import { AdminDeliveryListDto, AdminDeliverySettingsResponseDto, DeliveryEmptyDto, DeliveryListDto, DeliveryPageDto, DeliveryRejectDto, DeliveryRequestDto, DeliveryResponseDto, DeliverySettingsDto, DeliverySettingsResponseDto } from './delivery.dto.js';
import { DeliveryService } from './delivery.service.js';

@Injectable()
export class RegisteredClientGuard implements CanActivate {
  canActivate(context:ExecutionContext) {
    const request=context.switchToHttp().getRequest<{clientIdentity?:ClientIdentity}>();
    if (!request.clientIdentity?.userId || request.clientIdentity.guestSessionId) throw new UnauthorizedException('Se requiere una cuenta de cliente registrada.');
    return true;
  }
}
const idempotency=()=>ApiHeader({name:'Idempotency-Key',required:true});

@ApiTags('Domicilios') @Controller('delivery')
export class DeliveryPublicController {
  constructor(private readonly service:DeliveryService) {}
  @Get('settings') @ApiOperation({summary:'Consultar cobertura y tarifa vigente.'}) @ApiOkResponse({type:DeliverySettingsResponseDto})
  async settings() {const {version,enabled,coverageDescription,shippingFeeCents,currency}=await this.service.settings(); return {version,enabled,coverageDescription,shippingFeeCents,currency};}
}

@ApiTags('Solicitudes de domicilio') @ApiBearerAuth('client-token') @UseGuards(ClientAccessGuard,RegisteredClientGuard) @Controller('me/delivery-requests')
@ApiResponse({status:400,description:'Datos inválidos.'}) @ApiResponse({status:401,description:'Se requiere sesión de cliente registrado.'}) @ApiResponse({status:403,description:'El personal no puede usar esta ruta.'}) @ApiResponse({status:404,description:'Solicitud no encontrada.'}) @ApiResponse({status:409,description:'Conflicto operativo.'})
export class ClientDeliveryController {
  constructor(private readonly service:DeliveryService) {}
  @Post() @idempotency() @ApiOperation({summary:'Solicitar revisión de cobertura.'}) @ApiCreatedResponse({type:DeliveryResponseDto})
  create(@Body() dto:DeliveryRequestDto,@CurrentClient() client:ClientIdentity,@Headers('idempotency-key') key?:string) {return this.service.create(dto,client,key);}
  @Get() @ApiOperation({summary:'Consultar solicitudes propias.'}) @ApiOkResponse({type:DeliveryPageDto})
  list(@Query() query:DeliveryListDto,@CurrentClient() client:ClientIdentity) {return this.service.list(query,client.clientId);}
  @Get(':id') @ApiOperation({summary:'Consultar solicitud propia.'}) @ApiOkResponse({type:DeliveryResponseDto})
  detail(@Param('id',ParseUUIDPipe) id:string,@CurrentClient() client:ClientIdentity) {return this.service.detail(id,client.clientId);}
  @Post(':id/cancel') @HttpCode(200) @idempotency() @ApiOperation({summary:'Cancelar solicitud propia.'}) @ApiOkResponse({type:DeliveryResponseDto})
  cancel(@Param('id',ParseUUIDPipe) id:string,@Body() _dto:DeliveryEmptyDto,@CurrentClient() client:ClientIdentity,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string) {return this.service.transition(id,'cancel',actor,client,undefined,key);}
}

@ApiTags('Domicilios administrativos') @ApiBearerAuth('access-token') @UseGuards(AuthAccessGuard,PermissionsGuard) @Controller('admin')
@ApiResponse({status:400,description:'Datos inválidos.'}) @ApiResponse({status:401,description:'Sesión inválida.'}) @ApiResponse({status:403,description:'Falta permiso.'}) @ApiResponse({status:404,description:'Solicitud no encontrada.'}) @ApiResponse({status:409,description:'Conflicto operativo.'})
export class AdminDeliveryController {
  constructor(private readonly service:DeliveryService) {}
  @Get('delivery/settings') @RequirePermission('delivery.read') @ApiOperation({summary:'Consultar configuración de domicilios.'}) @ApiOkResponse({type:AdminDeliverySettingsResponseDto})
  settings(){return this.service.settings();}
  @Put('delivery/settings') @RequirePermission('delivery.configure') @idempotency() @ApiOperation({summary:'Actualizar configuración versionada.'}) @ApiOkResponse({type:AdminDeliverySettingsResponseDto})
  update(@Body() dto:DeliverySettingsDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string){return this.service.updateSettings(dto,actor,key);}
  @Get('delivery-requests') @RequirePermission('delivery.read') @ApiOperation({summary:'Listar solicitudes.'}) @ApiOkResponse({type:DeliveryPageDto})
  list(@Query() query:AdminDeliveryListDto){return this.service.list(query);}
  @Get('delivery-requests/:id') @RequirePermission('delivery.read') @ApiOperation({summary:'Consultar solicitud.'}) @ApiOkResponse({type:DeliveryResponseDto})
  detail(@Param('id',ParseUUIDPipe) id:string){return this.service.detail(id);}
  @Post('delivery-requests/:id/approve') @HttpCode(200) @RequirePermission('delivery.review') @idempotency() @ApiOperation({summary:'Aprobar cobertura.'}) @ApiOkResponse({type:DeliveryResponseDto})
  approve(@Param('id',ParseUUIDPipe) id:string,@Body() _dto:DeliveryEmptyDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string){return this.service.transition(id,'approve',actor,undefined,undefined,key);}
  @Post('delivery-requests/:id/reject') @HttpCode(200) @RequirePermission('delivery.review') @idempotency() @ApiOperation({summary:'Rechazar cobertura.'}) @ApiOkResponse({type:DeliveryResponseDto})
  reject(@Param('id',ParseUUIDPipe) id:string,@Body() dto:DeliveryRejectDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string){return this.service.transition(id,'reject',actor,undefined,dto.reason,key);}
}
