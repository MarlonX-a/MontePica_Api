import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientAccessGuard } from './client-access.guard.js';
import { ResolvedTableQrDto, ResolveTableQrDto } from './dto/table-access.dto.js';
import { TableAccessService } from './table-access.service.js';

@ApiTags('Acceso a mesas')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@Controller('table-access')
export class TableAccessController {
  constructor(private readonly service: TableAccessService) {}

  @Post('resolve') @HttpCode(200)
  @ApiOperation({ summary: 'Resolver QR como cliente registrado o invitado.' })
  @ApiOkResponse({ type: ResolvedTableQrDto })
  @ApiResponse({ status: 400, description: 'Token QR inválido o campos desconocidos.' })
  @ApiResponse({ status: 401, description: 'Sesión no válida.' })
  @ApiResponse({ status: 403, description: 'El usuario autenticado no es cliente.' })
  @ApiResponse({ status: 404, description: 'QR desconocido, renovado o de una visita anterior.' })
  @ApiResponse({ status: 409, description: 'Mesa inactiva o jornada fuera de condiciones operativas.' })
  resolve(@Body() dto: ResolveTableQrDto) { return this.service.resolveQr(dto.qrToken); }
}
