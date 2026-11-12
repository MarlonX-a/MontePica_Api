import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { ConfirmTransferDto } from './dto/confirm-transfer.dto.js';
import { RejectTransferDto } from './dto/reject-transfer.dto.js';
import { TransferDecisionDto } from './dto/transfer-decision.dto.js';
import { TransferSubmittedDto } from './dto/transfer-submitted.dto.js';
import { type ReceiptFile, TransfersService } from './transfers.service.js';

const uploadDoc = () =>
  ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  });

const uploadInterceptor = () =>
  UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5242880, files: 1, fields: 0, parts: 1 },
    }),
  );

const idempotency = () =>
  ApiHeader({ name: 'Idempotency-Key', required: true });

@ApiTags('Transferencias administrativas')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
@ApiResponse({ status: 413, description: 'Archivo demasiado grande.' })
@ApiResponse({ status: 415, description: 'Formato de archivo inválido.' })
@ApiResponse({ status: 503, description: 'Almacenamiento no disponible.' })
export class AdminTransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post('settlements/:id/transfer-payments')
  @RequirePermission('payments.registerTransfer')
  @ApiConsumes('multipart/form-data')
  @uploadDoc()
  @uploadInterceptor()
  @idempotency()
  @ApiCreatedResponse({ type: TransferSubmittedDto })
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: ReceiptFile,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.transfers.upload(
      id,
      file,
      { userId: actor.userId },
      undefined,
      actor,
      key,
    );
  }

  @Post('payments/:id/confirm')
  @HttpCode(200)
  @RequirePermission('payments.verify')
  @idempotency()
  @ApiOkResponse({ type: TransferDecisionDto })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmTransferDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.transfers.decide(
      id,
      'confirm',
      dto.bankOperationReference,
      actor,
      key,
    );
  }

  @Post('payments/:id/reject')
  @HttpCode(200)
  @RequirePermission('payments.verify')
  @idempotency()
  @ApiOkResponse({ type: TransferDecisionDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.transfers.decide(id, 'reject', dto.reason, actor, key);
  }

  @Get('payments/:id/receipt')
  @RequirePermission('payments.receipts.read')
  async receipt(@Param('id', ParseUUIDPipe) id: string) {
    const file = await this.transfers.receipt(id);
    return new StreamableFile(file.body, {
      type: file.mime,
      disposition: 'attachment; filename="comprobante"',
    });
  }
}
