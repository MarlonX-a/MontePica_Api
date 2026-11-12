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
import { CreateAdminProductDto } from './dto/create-admin-product.dto.js';
import { UpdateAdminProductDto } from './dto/update-admin-product.dto.js';
import { VisibilityDto } from './dto/visibility.dto.js';

@ApiTags('Administración')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class AdminProductsController {
  constructor(private readonly service: CatalogAdminService) {}

  @ApiOperation({ operationId: 'AdminController_products', summary: undefined })
  @Get('products')
  @RequirePermission('catalog.read')
  products(@Query() q: ListAdminQueryDto) {
    return this.service.listProducts(q);
  }

  @ApiOperation({ operationId: 'AdminController_product', summary: undefined })
  @Get('products/:id')
  @RequirePermission('catalog.read')
  product(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getProduct(id);
  }

  @ApiOperation({
    operationId: 'AdminController_createProduct',
    summary: undefined,
  })
  @Post('products')
  @RequirePermission('catalog.write')
  createProduct(
    @Body() dto: CreateAdminProductDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.createProduct(dto, actor);
  }

  @ApiOperation({
    operationId: 'AdminController_updateProduct',
    summary: undefined,
  })
  @Patch('products/:id')
  @RequirePermission('catalog.write')
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminProductDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.updateProduct(id, dto, actor);
  }

  @ApiOperation({
    operationId: 'AdminController_visibility',
    summary: undefined,
  })
  @Patch('products/:id/visibility')
  @RequirePermission('catalog.visibility')
  visibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VisibilityDto,
    @CurrentUserContext() actor: AuthenticatedRequestContext,
  ) {
    return this.service.setVisibility(id, dto.visibleInMenu, actor);
  }
}
