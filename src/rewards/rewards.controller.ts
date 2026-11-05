import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { ClientAccessGuard, CurrentClient, type ClientIdentity } from '../tables/client-access.guard.js';
import { CancellationEmptyDto } from '../tables/cancellations.dto.js';
import { AdminRedemptionListDto, CreateRedemptionDto, RedemptionListDto, RedemptionPageDto, RedemptionResponseDto, RejectRedemptionDto, RewardCreateDto, RewardListDto, RewardPageDto, RewardResponseDto, RewardUpdateDto } from './rewards.dto.js';
import { RewardsService } from './rewards.service.js';

@ApiTags('Recompensas')
@ApiResponse({status:400,description:'Datos inválidos.'})
@ApiResponse({status:404,description:'Recurso no encontrado.'})
@ApiResponse({status:409,description:'Saldo, inventario, estado o versión en conflicto.'})
@Controller()
export class RewardsController {
  constructor(private readonly service:RewardsService){}
  @Get('rewards') @ApiOkResponse({type:RewardPageDto}) list(@Query() q:RewardListDto){return this.service.listRewards(q,false);}
  @Get('rewards/:id') @ApiOkResponse({type:RewardResponseDto}) reward(@Param('id',ParseUUIDPipe) id:string){return this.service.publicReward(id);}
}

@ApiTags('Recompensas administrativas') @ApiBearerAuth('access-token') @UseGuards(AuthAccessGuard,PermissionsGuard) @Controller('admin/rewards')
export class AdminRewardsController {
  constructor(private readonly service:RewardsService){}
  @Get() @RequirePermission('rewards.read') @ApiOkResponse({type:RewardPageDto}) list(@Query() q:RewardListDto){return this.service.listRewards(q,true);}
  @Get(':id') @RequirePermission('rewards.read') @ApiOkResponse({type:RewardResponseDto}) detail(@Param('id',ParseUUIDPipe) id:string){return this.service.adminReward(id);}
  @Post() @RequirePermission('rewards.manage') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiCreatedResponse({type:RewardResponseDto})
  create(@Body() dto:RewardCreateDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string){return this.service.createReward(dto,actor,key);}
  @Patch(':id') @RequirePermission('rewards.manage') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOkResponse({type:RewardResponseDto})
  update(@Param('id',ParseUUIDPipe) id:string,@Body() dto:RewardUpdateDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string){return this.service.updateReward(id,dto,actor,key);}
}

@ApiTags('Canjes del cliente') @ApiBearerAuth('client-token') @UseGuards(ClientAccessGuard) @Controller()
export class ClientRedemptionsController {
  constructor(private readonly service:RewardsService){}
  @Post('visits/:id/redemptions') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiCreatedResponse({type:RedemptionResponseDto})
  create(@Param('id',ParseUUIDPipe) id:string,@Body() dto:CreateRedemptionDto,@CurrentClient() client:ClientIdentity,@Headers('idempotency-key') key?:string){return this.service.request(id,dto,client,key);}
  @Get('me/redemptions') @ApiOkResponse({type:RedemptionPageDto}) list(@Query() q:RedemptionListDto,@CurrentClient() c:ClientIdentity){if(!c.userId)throw new UnauthorizedException('Se requiere una cuenta registrada.');return this.service.listRedemptions(q,c.clientId);}
  @Get('me/redemptions/:id') @ApiOkResponse({type:RedemptionResponseDto}) detail(@Param('id',ParseUUIDPipe) id:string,@CurrentClient() c:ClientIdentity){if(!c.userId)throw new UnauthorizedException('Se requiere una cuenta registrada.');return this.service.redemption(id,c.clientId);}
  @Post('me/redemptions/:id/cancel') @HttpCode(200) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOkResponse({type:RedemptionResponseDto})
  cancel(@Param('id',ParseUUIDPipe) id:string,@Body() _dto:CancellationEmptyDto,@CurrentClient() c:ClientIdentity,@Headers('idempotency-key') key?:string){return this.service.cancel(id,c,key);}
}

@ApiTags('Canjes administrativos') @ApiBearerAuth('access-token') @UseGuards(AuthAccessGuard,PermissionsGuard) @Controller('admin/redemptions')
export class AdminRedemptionsController {
  constructor(private readonly service:RewardsService){}
  @Get() @RequirePermission('redemptions.read') @ApiOkResponse({type:RedemptionPageDto}) list(@Query() q:AdminRedemptionListDto){return this.service.listRedemptions(q);}
  @Get(':id') @RequirePermission('redemptions.read') @ApiOkResponse({type:RedemptionResponseDto,description:'Incluye historial de decisión.'}) detail(@Param('id',ParseUUIDPipe) id:string){return this.service.redemption(id,undefined,undefined,true);}
  @Post(':id/approve') @HttpCode(200) @RequirePermission('redemptions.manage') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOkResponse({type:RedemptionResponseDto})
  approve(@Param('id',ParseUUIDPipe) id:string,@Body() _dto:CancellationEmptyDto,@CurrentUserContext() a:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string){return this.service.decide(id,'approve',a,key);}
  @Post(':id/reject') @HttpCode(200) @RequirePermission('redemptions.manage') @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOkResponse({type:RedemptionResponseDto})
  reject(@Param('id',ParseUUIDPipe) id:string,@Body() dto:RejectRedemptionDto,@CurrentUserContext() a:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string){return this.service.decide(id,'reject',a,key,dto.reason);}
}
