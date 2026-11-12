import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { type AuthenticatedRequestContext } from '../auth/auth.types.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { ListAdminQueryDto } from '../common/dto/list-admin-query.dto.js';
import { CreateAdminUserDto } from './dto/create-admin-user.dto.js';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Administración')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @ApiOperation({ operationId: 'AdminController_users', summary: undefined })
  @Get('users')
  @RequirePermission('users.read')
  users(@Query() q: ListAdminQueryDto) {
    return this.service.listUsers(q);
  }

  @ApiOperation({ operationId: 'AdminController_user', summary: undefined })
  @Get('users/:id')
  @RequirePermission('users.read')
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getUser(id);
  }

  @ApiOperation({
    operationId: 'AdminController_createUser',
    summary: undefined,
  })
  @Post('users')
  @RequirePermission('users.create')
  createUser(
    @Body() dto: CreateAdminUserDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.createUser(dto, actor);
  }

  @ApiOperation({
    operationId: 'AdminController_updateUser',
    summary: undefined,
  })
  @Patch('users/:id')
  @RequirePermission('users.update')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.updateUser(id, dto, actor);
  }
}
