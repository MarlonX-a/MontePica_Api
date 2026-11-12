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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CancellationEmptyDto } from '../cancellations/dto/cancellation-empty.dto.js';
import {
  ClientAccessGuard,
  type ClientIdentity,
  CurrentClient,
} from '../common/identity/client-access.guard.js';
import { CreateRedemptionDto } from './dto/create-redemption.dto.js';
import { RedemptionListDto } from './dto/redemption-list.dto.js';
import { RedemptionPageDto } from './dto/redemption-page.dto.js';
import { RedemptionResponseDto } from './dto/redemption-response.dto.js';
import { RedemptionsQueryService } from './redemptions-query.service.js';
import { RedemptionsService } from './redemptions.service.js';

@ApiTags('Canjes del cliente')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard)
@Controller()
export class ClientRedemptionsController {
  constructor(
    private readonly service: RedemptionsService,
    private readonly queries: RedemptionsQueryService,
  ) {}

  @Post('visits/:id/redemptions')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: RedemptionResponseDto })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRedemptionDto,
    @CurrentClient() client: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.request(id, dto, client, key);
  }

  @Get('me/redemptions')
  @ApiOkResponse({ type: RedemptionPageDto })
  list(@Query() q: RedemptionListDto, @CurrentClient() c: ClientIdentity) {
    if (!c.userId)
      throw new UnauthorizedException('Se requiere una cuenta registrada.');
    return this.queries.listRedemptions(q, c.clientId);
  }

  @Get('me/redemptions/:id')
  @ApiOkResponse({ type: RedemptionResponseDto })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentClient() c: ClientIdentity,
  ) {
    if (!c.userId)
      throw new UnauthorizedException('Se requiere una cuenta registrada.');
    return this.queries.redemption(id, c.clientId);
  }

  @Post('me/redemptions/:id/cancel')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: RedemptionResponseDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: CancellationEmptyDto,
    @CurrentClient() c: ClientIdentity,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.cancel(id, c, key);
  }
}
