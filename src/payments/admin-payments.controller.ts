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
  ApiCreatedResponse,
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
import { SettlementEmptyDto } from '../settlements/dto/settlement-empty.dto.js';
import { AdminPaymentListDto } from './dto/admin-payment-list.dto.js';
import { AdminPaymentResponseDto } from './dto/admin-payment-response.dto.js';
import { CashPaymentDto } from './dto/cash-payment.dto.js';
import { PaymentCompletionDto } from './dto/payment-completion.dto.js';
import { PaymentPageDto } from './dto/payment-page.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('Pagos administrativos')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
@ApiResponse({ status: 400, description: 'Datos inválidos.' })
@ApiResponse({ status: 401, description: 'Sesión inválida.' })
@ApiResponse({ status: 403, description: 'Falta permiso.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' })
@ApiResponse({ status: 409, description: 'Conflicto operativo.' })
export class AdminPaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post('settlements/:id/cash-payments')
  @RequirePermission('payments.collect')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Cobrar en efectivo y cerrar cuenta.' })
  @ApiCreatedResponse({ type: PaymentCompletionDto })
  cash(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashPaymentDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.collect(id, dto.receivedCents, actor, key);
  }

  @Post('settlements/:id/complete-without-payment')
  @HttpCode(200)
  @RequirePermission('payments.collect')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Cerrar liquidación de total cero.' })
  @ApiOkResponse({ type: PaymentCompletionDto })
  zero(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _body: SettlementEmptyDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.collect(id, null, actor, key);
  }

  @Get('payments')
  @RequirePermission('payments.read')
  @ApiOperation({ summary: 'Consultar pagos.' })
  @ApiOkResponse({ type: PaymentPageDto })
  list(@Query() query: AdminPaymentListDto) {
    return this.service.list(query);
  }

  @Get('payments/:id')
  @RequirePermission('payments.read')
  @ApiOperation({ summary: 'Consultar pago e historial.' })
  @ApiOkResponse({ type: AdminPaymentResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id, undefined, true);
  }
}
