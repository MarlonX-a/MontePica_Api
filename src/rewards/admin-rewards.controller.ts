import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RewardCreateDto } from './dto/reward-create.dto.js';
import { RewardListDto } from './dto/reward-list.dto.js';
import { RewardPageDto } from './dto/reward-page.dto.js';
import { RewardResponseDto } from './dto/reward-response.dto.js';
import { RewardUpdateDto } from './dto/reward-update.dto.js';
import { RewardsService } from './rewards.service.js';

@ApiTags('Recompensas administrativas')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin/rewards')
export class AdminRewardsController {
  constructor(private readonly service: RewardsService) {}

  @Get()
  @RequirePermission('rewards.read')
  @ApiOkResponse({ type: RewardPageDto })
  list(@Query() q: RewardListDto) {
    return this.service.listRewards(q, true);
  }

  @Get(':id')
  @RequirePermission('rewards.read')
  @ApiOkResponse({ type: RewardResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminReward(id);
  }

  @Post()
  @RequirePermission('rewards.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: RewardResponseDto })
  create(
    @Body() dto: RewardCreateDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.createReward(dto, actor, key);
  }

  @Patch(':id')
  @RequirePermission('rewards.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: RewardResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RewardUpdateDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.updateReward(id, dto, actor, key);
  }
}
