import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentGuest, GuestSessionGuard } from './client-access.guard.js';
import { GuestSessionsService, type GuestIdentity } from './guest-sessions.service.js';
import { CreateGuestSessionDto, GuestSessionDto } from './dto/table-access.dto.js';

@ApiTags('Sesiones invitadas')
@Controller('guest-sessions')
export class GuestSessionsController {
  constructor(private readonly service: GuestSessionsService) {}

  @Post() @UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Crear invitado y sesión de 24 horas, sin renovación.' })
  @ApiCreatedResponse({ type: GuestSessionDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos o campos desconocidos.' })
  @ApiResponse({ status: 429, description: 'Máximo 10 creaciones por minuto e IP.' })
  create(@Body() dto: CreateGuestSessionDto) { return this.service.create(dto); }

  @Delete('current') @HttpCode(204) @UseGuards(GuestSessionGuard)
  @ApiBearerAuth('client-token')
  @ApiOperation({ summary: 'Revocar la sesión invitada actual; solo token guest_.' })
  @ApiResponse({ status: 204, description: 'Sesión revocada.' })
  @ApiResponse({ status: 401, description: 'Sesión invitada desconocida, vencida o revocada.' })
  revoke(@CurrentGuest() identity: GuestIdentity) { return this.service.revoke(identity); }
}
