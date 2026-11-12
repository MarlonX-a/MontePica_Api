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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { CancellationsService } from './cancellations.service.js';
import { AdminCancellationListDto } from './dto/admin-cancellation-list.dto.js';
import { AdminCancellationPageDto } from './dto/admin-cancellation-page.dto.js';
import { AdminCancellationResponseDto } from './dto/admin-cancellation-response.dto.js';
import { CancellationCreateDto } from './dto/cancellation-create.dto.js';
import { CancellationEmptyDto } from './dto/cancellation-empty.dto.js';
import { CancellationReasonDto } from './dto/cancellation-reason.dto.js';

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
  constructor(private readonly service: CancellationsService) {}

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
    return this.service.create(id, d, a, undefined, k);
  }

  @Get('cancellation-requests')
  @RequirePermission('cancellations.read')
  @ApiOkResponse({ type: AdminCancellationPageDto })
  list(@Query() q: AdminCancellationListDto) {
    return this.service.list(q);
  }

  @Get('cancellation-requests/:id')
  @RequirePermission('cancellations.read')
  @ApiOkResponse({ type: AdminCancellationResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id);
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
    return this.service.decide(id, 'approve', a, undefined, undefined, k);
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
    return this.service.decide(id, 'reject', a, undefined, d.reason, k);
  }
}
