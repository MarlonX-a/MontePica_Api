import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { AdminRefundPageDto } from './dto/admin-refund-page.dto.js';
import { AdminRefundResponseDto } from './dto/admin-refund-response.dto.js';
import { RefundExecutionDto } from './dto/refund-execution.dto.js';
import { RefundListDto } from './dto/refund-list.dto.js';
import { RefundsService } from './refunds.service.js';

@ApiTags('Cancelaciones administrativas')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@ApiResponse({ status: 400, description: 'Datos invalidos.' })
@ApiResponse({ status: 401, description: 'Sesion invalida.' })
@ApiResponse({ status: 403, description: 'Falta permiso o administrador.' })
@ApiResponse({ status: 404, description: 'Recurso inexistente.' })
@ApiResponse({ status: 409, description: 'Conflicto operativo.' })
@Controller('admin')
export class AdminRefundsController {
  constructor(private readonly service: RefundsService) {}

  @ApiOperation({
    operationId: 'AdminCancellationsController_executeRefund',
    summary: undefined,
  })
  @Post('refunds/:id/execute')
  @HttpCode(200)
  @RequirePermission('refunds.execute')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AdminRefundResponseDto })
  executeRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundExecutionDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.executeRefund(id, dto, actor, key);
  }

  @ApiOperation({
    operationId: 'AdminCancellationsController_refund',
    summary: undefined,
  })
  @Get('refunds/:id')
  @RequirePermission('refunds.read')
  @ApiOkResponse({ type: AdminRefundResponseDto })
  refund(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.refund(id, undefined, true);
  }

  @ApiOperation({
    operationId: 'AdminCancellationsController_refunds',
    summary: undefined,
  })
  @Get('refunds')
  @RequirePermission('refunds.read')
  @ApiOkResponse({ type: AdminRefundPageDto })
  refunds(@Query() q: RefundListDto) {
    return this.service.refunds(q, undefined, true);
  }
}
