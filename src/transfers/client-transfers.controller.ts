import {
  Controller,
  Get,
  Headers,
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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
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

@ApiTags('Transferencias propias')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@Controller('me')
@ApiResponse({ status: 413, description: 'Archivo demasiado grande.' })
@ApiResponse({ status: 415, description: 'Formato de archivo inválido.' })
@ApiResponse({ status: 503, description: 'Almacenamiento no disponible.' })
export class ClientTransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post('settlements/:id/transfer-payments')
  @ApiConsumes('multipart/form-data')
  @uploadDoc()
  @uploadInterceptor()
  @idempotency()
  @ApiOperation({ summary: 'Enviar comprobante propio.' })
  @ApiCreatedResponse({ type: TransferSubmittedDto })
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: ReceiptFile,
    @CurrentClient() client: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.transfers.upload(
      id,
      file,
      client.guestSessionId
        ? { guestSessionId: client.guestSessionId }
        : { userId: client.userId },
      client,
      undefined,
      key,
    );
  }

  @Get('payments/:id/receipt')
  @ApiOperation({ summary: 'Descargar comprobante propio.' })
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
  ) {
    const file = await this.transfers.receipt(id, client.clientId);
    return new StreamableFile(file.body, {
      type: file.mime,
      disposition: 'attachment; filename="comprobante"',
    });
  }
}
