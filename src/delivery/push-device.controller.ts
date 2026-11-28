import { Body, Controller, Delete, HttpCode, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { ClientAccessGuard } from '../common/identity/client-access.guard.js';
import { RegisteredClientGuard } from '../common/identity/registered-client.guard.js';
import { DeliveryPushStore } from '../database/delivery-push.store.js';
import { PushDeviceDto } from './dto/push-device.dto.js';

@ApiTags('Dispositivo push')
@ApiBearerAuth('client-token')
@UseGuards(ClientAccessGuard, RegisteredClientGuard)
@Controller('me/push-device')
export class PushDeviceController {
  constructor(private readonly store: DeliveryPushStore) {}

  @Put()
  @HttpCode(204)
  @ApiNoContentResponse()
  register(@CurrentUserContext() actor: AuthenticatedRequestContext, @Body() dto: PushDeviceDto) {
    return this.store.register(actor.sessionId, dto.expoPushToken);
  }

  @Delete()
  @HttpCode(204)
  @ApiNoContentResponse()
  unregister(@CurrentUserContext() actor: AuthenticatedRequestContext) {
    return this.store.unregister(actor.sessionId);
  }
}
