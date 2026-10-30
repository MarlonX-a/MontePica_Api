import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CreateTableDto, IssuedTableQrDto, ListedTableDto, ListTablesDto, OpenVisitDto, TableDto, TablesPageDto } from './dto/table-access.dto.js';
import { TablesService } from './tables.service.js';
import { UpdateTableDto } from './dto/participation.dto.js';

@ApiTags('Mesas y visitas')
@ApiBearerAuth('access-token')
@ApiResponse({ status: 400, description: 'Datos o UUID inválidos.' })
@ApiResponse({ status: 401, description: 'JWT o sesión inválida.' })
@ApiResponse({ status: 403, description: 'Falta el permiso requerido.' })
@ApiResponse({ status: 404, description: 'Recurso inexistente.' })
@ApiResponse({ status: 409, description: 'Estado operativo incompatible o duplicado.' })
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class TablesController {
  constructor(private readonly service: TablesService) {}

  @Get('tables') @RequirePermission('tables.read')
  @ApiOperation({ summary: 'Listar mesas (tables.read).' })
  @ApiOkResponse({ type: TablesPageDto })
  tables(@Query() query: ListTablesDto) { return this.service.tables(query.page, query.limit); }

  @Get('tables/:id') @RequirePermission('tables.read')
  @ApiOperation({ summary: 'Consultar mesa y visita abierta.' })
  @ApiOkResponse({ type: ListedTableDto })
  table(@Param('id', ParseUUIDPipe) id: string) { return this.service.table(id); }

  @Patch('tables/:id') @RequirePermission('tables.manage')
  @ApiOperation({ summary: 'Cambiar código o estado de la mesa.' })
  @ApiOkResponse({ type: TableDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTableDto, @CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.service.updateTable(id, dto, actor.userId);
  }

  @Post('tables') @RequirePermission('tables.manage')
  @ApiOperation({ summary: 'Crear mesa (tables.manage).' })
  @ApiCreatedResponse({ type: TableDto })
  create(@Body() dto: CreateTableDto, @CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.service.createTable(dto.code, actor.userId);
  }

  @Post('tables/:id/visits') @RequirePermission('visits.manage')
  @ApiOperation({ summary: 'Abrir visita e invalidar QR anterior (visits.manage).' })
  @ApiCreatedResponse({ type: OpenVisitDto })
  open(@Param('id', ParseUUIDPipe) id: string, @CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.service.openVisit(id, actor.userId);
  }

  @Post('visits/:id/qr') @RequirePermission('visits.manage')
  @ApiOperation({ summary: 'Emitir QR nuevo y cancelar solicitudes pendientes (visits.manage).' })
  @ApiCreatedResponse({ type: IssuedTableQrDto })
  qr(@Param('id', ParseUUIDPipe) id: string, @CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.service.issueQr(id, actor.userId);
  }
}
