import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { AccountsService } from './accounts.service.js';
import { AccountPageDto } from './dto/account-page.dto.js';
import { AccountResponseDto } from './dto/account-response.dto.js';
import { AdminAccountListDto } from './dto/admin-account-list.dto.js';

@ApiTags('Cuentas y liquidaciones administrativas')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
@ApiResponse({ status: 400, description: 'Datos inválidos.' })
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 403, description: 'Falta permiso.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' })
@ApiResponse({ status: 409, description: 'Conflicto operativo.' })
export class AdminAccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get('accounts')
  @RequirePermission('accounts.read')
  @ApiOperation({
    operationId: 'AdminSettlementsController_accounts',
    summary: 'Listar cuentas.',
  })
  @ApiOkResponse({ type: AccountPageDto })
  accounts(@Query() query: AdminAccountListDto) {
    return this.service.accounts(query);
  }

  @Get('accounts/:id')
  @RequirePermission('accounts.read')
  @ApiOperation({
    operationId: 'AdminSettlementsController_account',
    summary: 'Consultar cuenta y consumo.',
  })
  @ApiOkResponse({ type: AccountResponseDto })
  account(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.account(id);
  }
}
