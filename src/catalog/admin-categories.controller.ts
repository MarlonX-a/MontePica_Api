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
import { CatalogAdminService } from './catalog-admin.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@ApiTags('Administración')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class AdminCategoriesController {
  constructor(private readonly service: CatalogAdminService) {}

  @ApiOperation({
    operationId: 'AdminController_categories',
    summary: undefined,
  })
  @Get('categories')
  @RequirePermission('catalog.read')
  categories(@Query() q: ListAdminQueryDto) {
    return this.service.listCategories(q);
  }

  @ApiOperation({ operationId: 'AdminController_category', summary: undefined })
  @Get('categories/:id')
  @RequirePermission('catalog.read')
  category(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCategory(id);
  }

  @ApiOperation({
    operationId: 'AdminController_createCategory',
    summary: undefined,
  })
  @Post('categories')
  @RequirePermission('catalog.write')
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.createCategory(dto, actor);
  }

  @ApiOperation({
    operationId: 'AdminController_updateCategory',
    summary: undefined,
  })
  @Patch('categories/:id')
  @RequirePermission('catalog.write')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.updateCategory(id, dto, actor);
  }
}
