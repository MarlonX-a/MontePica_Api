import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { ClientAccessGuard, CurrentClient, type ClientIdentity } from './client-access.guard.js';
import { TransfersService, type ReceiptFile } from './transfers.service.js';

class ConfirmTransferDto { @ApiProperty({minLength:1,maxLength:120}) @Transform(({value}:{value:unknown})=>typeof value==='string'?value.normalize('NFC').trim().toUpperCase():value) @IsString() @Length(1,120) bankOperationReference:string; }
class RejectTransferDto { @ApiProperty({minLength:1,maxLength:500}) @Transform(({value}:{value:unknown})=>typeof value==='string'?value.trim():value) @IsString() @Length(1,500) reason:string; }
class TransferReceiptDto { @ApiProperty({enum:['image/jpeg','image/png','application/pdf']}) mime:string; @ApiProperty() size:number; @ApiProperty() sha256:string; }
class TransferSubmittedDto { @ApiProperty({format:'uuid'}) id:string; @ApiProperty({format:'uuid'}) settlementId:string; @ApiProperty({enum:['transfer']}) method:string; @ApiProperty({enum:['pendingVerification']}) status:string; @ApiProperty() amountCents:number; @ApiProperty({type:TransferReceiptDto}) receipt:TransferReceiptDto; }
class TransferDecisionDto { @ApiProperty({format:'uuid'}) id:string; @ApiProperty({format:'uuid'}) settlementId:string; @ApiProperty({enum:['confirmed','rejected']}) status:string; @ApiProperty({enum:['settled','pending']}) settlementStatus:string; }
const uploadDoc=()=>ApiBody({schema:{type:'object',required:['file'],properties:{file:{type:'string',format:'binary'}}}});
const uploadInterceptor=()=>UseInterceptors(FileInterceptor('file',{limits:{fileSize:5242880,files:1,fields:0,parts:1}}));
const idempotency=()=>ApiHeader({name:'Idempotency-Key',required:true});

@ApiTags('Transferencias propias') @ApiBearerAuth('client-token') @UseGuards(ClientAccessGuard) @Controller('me')
@ApiResponse({status:413,description:'Archivo demasiado grande.'}) @ApiResponse({status:415,description:'Formato de archivo inválido.'}) @ApiResponse({status:503,description:'Almacenamiento no disponible.'})
export class ClientTransfersController {
  constructor(private readonly transfers:TransfersService) {}
  @Post('settlements/:id/transfer-payments') @ApiConsumes('multipart/form-data') @uploadDoc() @uploadInterceptor() @idempotency() @ApiOperation({summary:'Enviar comprobante propio.'}) @ApiCreatedResponse({type:TransferSubmittedDto})
  upload(@Param('id',ParseUUIDPipe) id:string,@UploadedFile() file:ReceiptFile,@CurrentClient() client:ClientIdentity,@Headers('idempotency-key') key?:string) {return this.transfers.upload(id,file,client.guestSessionId?{guestSessionId:client.guestSessionId}:{userId:client.userId},client,undefined,key);}
  @Get('payments/:id/receipt') @ApiOperation({summary:'Descargar comprobante propio.'})
  async receipt(@Param('id',ParseUUIDPipe) id:string,@CurrentClient() client:ClientIdentity) {const file=await this.transfers.receipt(id,client.clientId); return new StreamableFile(file.body,{type:file.mime,disposition:'attachment; filename="comprobante"'});}
}

@ApiTags('Transferencias administrativas') @ApiBearerAuth('access-token') @UseGuards(AuthAccessGuard,PermissionsGuard) @Controller('admin')
@ApiResponse({status:413,description:'Archivo demasiado grande.'}) @ApiResponse({status:415,description:'Formato de archivo inválido.'}) @ApiResponse({status:503,description:'Almacenamiento no disponible.'})
export class AdminTransfersController {
  constructor(private readonly transfers:TransfersService) {}
  @Post('settlements/:id/transfer-payments') @RequirePermission('payments.registerTransfer') @ApiConsumes('multipart/form-data') @uploadDoc() @uploadInterceptor() @idempotency() @ApiCreatedResponse({type:TransferSubmittedDto})
  upload(@Param('id',ParseUUIDPipe) id:string,@UploadedFile() file:ReceiptFile,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string) {return this.transfers.upload(id,file,{userId:actor.userId},undefined,actor,key);}
  @Post('payments/:id/confirm') @HttpCode(200) @RequirePermission('payments.verify') @idempotency() @ApiOkResponse({type:TransferDecisionDto})
  confirm(@Param('id',ParseUUIDPipe) id:string,@Body() dto:ConfirmTransferDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string) {return this.transfers.decide(id,'confirm',dto.bankOperationReference,actor,key);}
  @Post('payments/:id/reject') @HttpCode(200) @RequirePermission('payments.verify') @idempotency() @ApiOkResponse({type:TransferDecisionDto})
  reject(@Param('id',ParseUUIDPipe) id:string,@Body() dto:RejectTransferDto,@CurrentUserContext() actor:AuthenticatedRequestContext,@Headers('idempotency-key') key?:string) {return this.transfers.decide(id,'reject',dto.reason,actor,key);}
  @Get('payments/:id/receipt') @RequirePermission('payments.receipts.read')
  async receipt(@Param('id',ParseUUIDPipe) id:string) {const file=await this.transfers.receipt(id); return new StreamableFile(file.body,{type:file.mime,disposition:'attachment; filename="comprobante"'});}
}
