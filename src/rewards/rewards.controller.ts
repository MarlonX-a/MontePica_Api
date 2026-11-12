import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RewardListDto } from './dto/reward-list.dto.js';
import { RewardPageDto } from './dto/reward-page.dto.js';
import { RewardResponseDto } from './dto/reward-response.dto.js';
import { RewardsService } from './rewards.service.js';

@ApiTags('Recompensas')
@ApiResponse({ status: 400, description: 'Datos inválidos.' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado.' })
@ApiResponse({
  status: 409,
  description: 'Saldo, inventario, estado o versión en conflicto.',
})
@Controller()
export class RewardsController {
  constructor(private readonly service: RewardsService) {}

  @Get('rewards')
  @ApiOkResponse({ type: RewardPageDto })
  list(@Query() q: RewardListDto) {
    return this.service.listRewards(q, false);
  }

  @Get('rewards/:id')
  @ApiOkResponse({ type: RewardResponseDto })
  reward(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.publicReward(id);
  }
}
