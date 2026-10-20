import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service.js';

@ApiTags('Estado del servicio')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Comprueba que la API responde' })
  @ApiResponse({ status: 200, description: 'La API está activa.' })
  getLiveness() {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Comprueba que la API puede usar PostgreSQL' })
  @ApiResponse({ status: 200, description: 'La API y PostgreSQL están disponibles.' })
  @ApiResponse({ status: 503, description: 'PostgreSQL no está disponible.' })
  async getReadiness() {
    const ready = await this.healthService.isDatabaseReady();
    if (!ready) {
      throw new ServiceUnavailableException('La base de datos no está disponible.');
    }
    return { status: 'ok', database: 'up' };
  }
}
