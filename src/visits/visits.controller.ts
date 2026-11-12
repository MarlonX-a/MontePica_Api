import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { IssuedTableQrDto } from './dto/issued-table-qr.dto.js';
import { OpenVisitDto } from './dto/open-visit.dto.js';
import { VisitsService } from './visits.service.js';

@ApiTags('Mesas y visitas')
@ApiBearerAuth('access-token')
@ApiResponse({ status: 400, description: 'Datos o UUID inválidos.' })
@ApiResponse({ status: 401, description: 'JWT o sesión inválida.' })
@ApiResponse({ status: 403, description: 'Falta el permiso requerido.' })
@ApiResponse({ status: 404, description: 'Recurso inexistente.' })
@ApiResponse({
  status: 409,
  description: 'Estado operativo incompatible o duplicado.',
})
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class VisitsController {
  constructor(private readonly service: VisitsService) {}

  @Post('tables/:id/visits')
  @RequirePermission('visits.manage')
  @ApiOperation({
    operationId: 'TablesController_open',
    summary: 'Abrir visita e invalidar QR anterior (visits.manage).',
  })
  @ApiCreatedResponse({ type: OpenVisitDto })
  open(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.openVisit(id, actor.userId);
  }

  @Post('visits/:id/qr')
  @RequirePermission('visits.manage')
  @ApiOperation({
    operationId: 'TablesController_qr',
    summary:
      'Emitir QR nuevo y cancelar solicitudes pendientes (visits.manage).',
  })
  @ApiCreatedResponse({ type: IssuedTableQrDto })
  qr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.issueQr(id, actor.userId);
  }
}
