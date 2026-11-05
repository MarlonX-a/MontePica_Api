import { RefundsService } from './refunds.service.js';
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
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import {
  ClientAccessGuard,
  CurrentClient,
  type ClientIdentity,
} from './client-access.guard.js';
import {
  AdminCancellationPageDto,
  AdminCancellationResponseDto,
  CancellationPageDto,
  CancellationResponseDto,
  RefundResponseDto,
  RefundPageDto,
  AdminRefundPageDto,
  AdminRefundResponseDto,
  RefundExecutionDto,
  AdminCancellationListDto,
  CancellationCreateDto,
  CancellationEmptyDto,
  CancellationListDto,
  CancellationReasonDto,
  RefundListDto,
} from './cancellations.dto.js';
import { CancellationsService } from './cancellations.service.js';
@ApiTags('Cancelaciones y devoluciones')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@ApiResponse({ status: 400, description: 'Datos invalidos.' })
@ApiResponse({ status: 401, description: 'Sesion invalida.' })
@ApiResponse({ status: 404, description: 'Recurso ajeno o inexistente.' })
@ApiResponse({
  status: 409,
  description: 'Estado, version o clave en conflicto.',
})
@Controller('me')
export class ClientCancellationsController {
  constructor(
    private readonly s: CancellationsService,
    private readonly refundsService: RefundsService,
  ) {}
  @Post('orders/:id/cancellation-requests')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: CancellationResponseDto })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CancellationCreateDto,
    @CurrentClient() c: ClientIdentity,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.s.create(
      id,
      d,
      c.guestSessionId
        ? { guestSessionId: c.guestSessionId }
        : { userId: c.userId },
      c,
      k,
    );
  }
  @Get('cancellation-requests')
  @ApiOkResponse({ type: CancellationPageDto })
  list(@Query() q: CancellationListDto, @CurrentClient() c: ClientIdentity) {
    return this.s.list(q, c.clientId);
  }
  @Get('cancellation-requests/:id')
  @ApiOkResponse({ type: CancellationResponseDto })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() c: ClientIdentity,
  ) {
    return this.s.detail(id, c.clientId);
  }
  @Post('cancellation-requests/:id/withdraw')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: CancellationResponseDto })
  withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _d: CancellationEmptyDto,
    @CurrentClient() c: ClientIdentity,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.s.decide(
      id,
      'withdraw',
      { userId: c.userId ?? '', sessionId: c.userSessionId ?? '' },
      c,
      undefined,
      k,
    );
  }
  @Get('refunds/:id') @ApiOkResponse({ type: RefundResponseDto }) refund(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() c: ClientIdentity,
  ) {
    return this.refundsService.refund(id, c.clientId);
  }
  @Get('refunds') @ApiOkResponse({ type: RefundPageDto }) refunds(
    @Query() q: RefundListDto,
    @CurrentClient() c: ClientIdentity,
  ) {
    return this.refundsService.refunds(q, c.clientId);
  }
}
@ApiTags('Cancelaciones administrativas')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@ApiResponse({ status: 400, description: 'Datos invalidos.' })
@ApiResponse({ status: 401, description: 'Sesion invalida.' })
@ApiResponse({ status: 403, description: 'Falta permiso o administrador.' })
@ApiResponse({ status: 404, description: 'Recurso inexistente.' })
@ApiResponse({ status: 409, description: 'Conflicto operativo.' })
@Controller('admin')
export class AdminCancellationsController {
  constructor(
    private readonly s: CancellationsService,
    private readonly refundsService: RefundsService,
  ) {}
  @Post('orders/:id/cancellation-requests')
  @RequirePermission('cancellations.create')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: AdminCancellationResponseDto })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CancellationCreateDto,
    @CurrentUserContext() a: AuthenticatedRequestContext,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.s.create(id, d, a, undefined, k);
  }
  @Get('cancellation-requests')
  @RequirePermission('cancellations.read')
  @ApiOkResponse({ type: AdminCancellationPageDto })
  list(@Query() q: AdminCancellationListDto) {
    return this.s.list(q);
  }
  @Get('cancellation-requests/:id')
  @RequirePermission('cancellations.read')
  @ApiOkResponse({ type: AdminCancellationResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.s.detail(id);
  }
  @Post('cancellation-requests/:id/approve')
  @HttpCode(200)
  @RequirePermission('cancellations.decide')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AdminCancellationResponseDto })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _d: CancellationEmptyDto,
    @CurrentUserContext() a: AuthenticatedRequestContext,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.s.decide(id, 'approve', a, undefined, undefined, k);
  }
  @Post('cancellation-requests/:id/reject')
  @HttpCode(200)
  @RequirePermission('cancellations.decide')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AdminCancellationResponseDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CancellationReasonDto,
    @CurrentUserContext() a: AuthenticatedRequestContext,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.s.decide(id, 'reject', a, undefined, d.reason, k);
  }
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
    return this.refundsService.executeRefund(id, dto, actor, key);
  }
  @Get('refunds/:id')
  @RequirePermission('refunds.read')
  @ApiOkResponse({ type: AdminRefundResponseDto })
  refund(@Param('id', ParseUUIDPipe) id: string) {
    return this.refundsService.refund(id, undefined, true);
  }
  @Get('refunds')
  @RequirePermission('refunds.read')
  @ApiOkResponse({ type: AdminRefundPageDto })
  refunds(@Query() q: RefundListDto) {
    return this.refundsService.refunds(q, undefined, true);
  }
}
