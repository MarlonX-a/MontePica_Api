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
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { CancellationEmptyDto } from '../cancellations/dto/cancellation-empty.dto.js';
import { AdminRedemptionListDto } from './dto/admin-redemption-list.dto.js';
import { RedemptionPageDto } from './dto/redemption-page.dto.js';
import { RedemptionResponseDto } from './dto/redemption-response.dto.js';
import { RejectRedemptionDto } from './dto/reject-redemption.dto.js';
import { RedemptionDecisionService } from './redemption-decision.service.js';
import { RedemptionsQueryService } from './redemptions-query.service.js';

@ApiTags('Canjes administrativos')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin/redemptions')
export class AdminRedemptionsController {
  constructor(
    private readonly service: RedemptionDecisionService,
    private readonly queries: RedemptionsQueryService,
  ) {}

  @Get()
  @RequirePermission('redemptions.read')
  @ApiOkResponse({ type: RedemptionPageDto })
  list(@Query() q: AdminRedemptionListDto) {
    return this.queries.listRedemptions(q);
  }

  @Get(':id')
  @RequirePermission('redemptions.read')
  @ApiOkResponse({
    type: RedemptionResponseDto,
    description: 'Incluye historial de decisión.',
  })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.queries.redemption(id, undefined, undefined, true);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('redemptions.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: RedemptionResponseDto })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: CancellationEmptyDto,
    @CurrentUserContext() a: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.decide(id, 'approve', a, key);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('redemptions.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: RedemptionResponseDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRedemptionDto,
    @CurrentUserContext() a: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.decide(id, 'reject', a, key, dto.reason);
  }
}
