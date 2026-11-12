import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RolesService } from './roles.service.js';

@ApiTags('Administración')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get('roles')
  @RequirePermission('roles.read')
  @ApiOperation({
    operationId: 'AdminController_roles',
    summary: 'Consulta roles estructurales y sus permisos.',
  })
  roles() {
    return this.service.listRoles();
  }
}
