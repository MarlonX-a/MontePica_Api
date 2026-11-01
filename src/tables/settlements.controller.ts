import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ClientAccessGuard, CurrentClient, type ClientIdentity } from './client-access.guard.js';
import { AccountListDto, AccountPageDto, AccountResponseDto, AdminAccountListDto, SettlementCancelDto, SettlementEmptyDto, SettlementListDto, SettlementPageDto, SettlementResponseDto } from './settlements.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('Cuentas del cliente') @ApiBearerAuth('client-token') @UseGuards(ClientAccessGuard) @Controller('me')
@ApiResponse({status:401,description:'Sesión inválida.'}) @ApiResponse({status:404,description:'Recurso no encontrado.'})
export class ClientSettlementsController {
  constructor(private readonly service:SettlementsService) {}
  @Get('accounts') @ApiOperation({summary:'Listar cuentas propias.'}) @ApiOkResponse({type:AccountPageDto})
  accounts(@Query() query:AccountListDto,@CurrentClient() client:ClientIdentity) {return this.service.accounts(query,client.clientId);}
  @Get('accounts/:id') @ApiOperation({summary:'Consultar consumo propio.'}) @ApiOkResponse({type:AccountResponseDto})
  account(@Param('id',ParseUUIDPipe) id:string,@CurrentClient() client:ClientIdentity) {return this.service.account(id,client.clientId);}
  @Get('settlements/:id') @ApiOperation({summary:'Consultar liquidación propia.'}) @ApiOkResponse({type:SettlementResponseDto})
  settlement(@Param('id',ParseUUIDPipe) id:string,@CurrentClient() client:ClientIdentity) {return this.service.settlement(id,client.clientId);}
}

@ApiTags('Cuentas y liquidaciones administrativas') @ApiBearerAuth('access-token') @UseGuards(AuthAccessGuard,PermissionsGuard) @Controller('admin')
@ApiResponse({status:400,description:'Datos inválidos.'}) @ApiResponse({status:401,description:'Sesión inválida.'}) @ApiResponse({status:403,description:'Falta permiso.'}) @ApiResponse({status:404,description:'Recurso no encontrado.'}) @ApiResponse({status:409,description:'Conflicto operativo.'})
export class AdminSettlementsController {
  constructor(private readonly service:SettlementsService) {}
  @Get('accounts') @RequirePermission('accounts.read') @ApiOperation({summary:'Listar cuentas.'}) @ApiOkResponse({type:AccountPageDto})
  accounts(@Query() query:AdminAccountListDto) {return this.service.accounts(query);}
  @Get('accounts/:id') @RequirePermission('accounts.read') @ApiOperation({summary:'Consultar cuenta y consumo.'}) @ApiOkResponse({type:AccountResponseDto})
  account(@Param('id',ParseUUIDPipe) id:string) {return this.service.account(id);}
  @Post('accounts/:id/settlements') @RequirePermission('settlements.manage') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOperation({summary:'Preparar liquidación completa.'}) @ApiCreatedResponse({type:SettlementResponseDto})
  create(@Param('id',ParseUUIDPipe) id:string,@Body() _body:SettlementEmptyDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string) {return this.service.create(id,actor,key);}
  @Get('settlements') @RequirePermission('settlements.read') @ApiOperation({summary:'Listar liquidaciones.'}) @ApiOkResponse({type:SettlementPageDto})
  settlements(@Query() query:SettlementListDto) {return this.service.settlements(query);}
  @Get('settlements/:id') @RequirePermission('settlements.read') @ApiOperation({summary:'Consultar liquidación.'}) @ApiOkResponse({type:SettlementResponseDto})
  settlement(@Param('id',ParseUUIDPipe) id:string) {return this.service.settlement(id);}
  @Post('settlements/:id/cancel') @HttpCode(200) @RequirePermission('settlements.manage') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOperation({summary:'Anular liquidación pendiente.'}) @ApiOkResponse({type:SettlementResponseDto})
  cancel(@Param('id',ParseUUIDPipe) id:string,@Body() dto:SettlementCancelDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string) {return this.service.cancel(id,dto.reason,actor,key);}
}
