import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { TablesService } from './tables.service.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';

@ApiTags('Mesas y visitas')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class TablesController {
  constructor(private readonly service: TablesService) {}
  @Get('tables') @RequirePermission('tables.read') tables(@Query('page') p='1',@Query('limit') l='20') {return this.service.tables(Number(p),Number(l));}
  @Post('tables') @RequirePermission('tables.manage') create(@Body() b:{code:string}) {return this.service.createTable(b.code);}
  @Post('tables/:id/visits') @RequirePermission('visits.manage') open(@Param('id') id:string,@CurrentUserContext() u:AuthenticatedRequestContext) {return this.service.openVisit(id,u.userId);}
  @Post('visits/:id/qr') @RequirePermission('visits.manage') qr(@Param('id') id:string) {return this.service.issueQr(id);}
}

@ApiTags('Acceso a mesas')
@Controller()
export class GuestSessionsController {
  constructor(private readonly service:TablesService, private readonly db:DataSource){}
  @Post('guest-sessions') @UseGuards(ThrottlerGuard) @Throttle({default:{limit:10,ttl:60000}})
  create(@Body() b:{name:string;phone?:string}) { return this.service.createGuest(b.name,b.phone); }
  @Delete('guest-sessions/current') @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Req() req:Request){const t=req.headers.authorization?.replace(/^Bearer\s+/i,'')||''; await this.service.leaveGuest(createHash('sha256').update(t).digest('hex'));}
}

@ApiTags('Participación en mesas')
@Controller()
export class TableAccessController {
  constructor(private readonly service:TablesService, private readonly db:DataSource){}
  @Post('table-access/resolve') resolve(@Body() b:{qrToken:string}) {return this.service.resolveQr(b.qrToken);}
}
