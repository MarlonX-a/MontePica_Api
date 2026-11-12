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
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { AccountsService } from './accounts.service.js';
import { AccountListDto } from './dto/account-list.dto.js';
import { AccountPageDto } from './dto/account-page.dto.js';
import { AccountResponseDto } from './dto/account-response.dto.js';

@ApiTags('Cuentas del cliente')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@Controller('me')
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' })
export class ClientAccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get('accounts')
  @ApiOperation({
    operationId: 'ClientSettlementsController_accounts',
    summary: 'Listar cuentas propias.',
  })
  @ApiOkResponse({ type: AccountPageDto })
  accounts(
    @Query() query: AccountListDto,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.accounts(query, client.clientId);
  }

  @Get('accounts/:id')
  @ApiOperation({
    operationId: 'ClientSettlementsController_account',
    summary: 'Consultar consumo propio.',
  })
  @ApiOkResponse({ type: AccountResponseDto })
  account(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() client: ClientIdentity,
  ) {
    return this.service.account(id, client.clientId);
  }
}
