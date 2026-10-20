import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthAccessGuard } from '../auth/auth-access.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/permissions.decorator.js';
import { CurrentUserContext } from '../auth/current-user.decorator.js';
import type { AuthenticatedRequestContext } from '../auth/auth.types.js';
import { AdminService } from './admin.service.js';
import { ListAdminQueryDto } from './dto/list-admin-query.dto.js';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/user.dto.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';
import { CreateAdminProductDto, UpdateAdminProductDto, VisibilityDto } from './dto/product.dto.js';

@ApiTags('Administración')
@ApiBearerAuth('access-token')
@UseGuards(AuthAccessGuard, PermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('roles') @RequirePermission('roles.read') @ApiOperation({ summary: 'Consulta roles estructurales y sus permisos.' })
  roles(){return this.admin.listRoles();}
  @Get('users') @RequirePermission('users.read') users(@Query() q:ListAdminQueryDto){return this.admin.listUsers(q);}
  @Get('users/:id') @RequirePermission('users.read') user(@Param('id',ParseUUIDPipe) id:string){return this.admin.getUser(id);}
  @Post('users') @RequirePermission('users.create') createUser(@Body() dto:CreateAdminUserDto,@CurrentUserContext() actor:AuthenticatedRequestContext){return this.admin.createUser(dto,actor);}
  @Patch('users/:id') @RequirePermission('users.update') updateUser(@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateAdminUserDto,@CurrentUserContext() actor:AuthenticatedRequestContext){return this.admin.updateUser(id,dto,actor);}

  @Get('categories') @RequirePermission('catalog.read') categories(@Query() q:ListAdminQueryDto){return this.admin.listCategories(q);}
  @Get('categories/:id') @RequirePermission('catalog.read') category(@Param('id',ParseUUIDPipe) id:string){return this.admin.getCategory(id);}
  @Post('categories') @RequirePermission('catalog.write') createCategory(@Body() dto:CreateCategoryDto,@CurrentUserContext() actor:AuthenticatedRequestContext){return this.admin.createCategory(dto,actor);}
  @Patch('categories/:id') @RequirePermission('catalog.write') updateCategory(@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateCategoryDto,@CurrentUserContext() actor:AuthenticatedRequestContext){return this.admin.updateCategory(id,dto,actor);}

  @Get('products') @RequirePermission('catalog.read') products(@Query() q:ListAdminQueryDto){return this.admin.listProducts(q);}
  @Get('products/:id') @RequirePermission('catalog.read') product(@Param('id',ParseUUIDPipe) id:string){return this.admin.getProduct(id);}
  @Post('products') @RequirePermission('catalog.write') createProduct(@Body() dto:CreateAdminProductDto,@CurrentUserContext() actor:AuthenticatedRequestContext){return this.admin.createProduct(dto,actor);}
  @Patch('products/:id') @RequirePermission('catalog.write') updateProduct(@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateAdminProductDto,@CurrentUserContext() actor:AuthenticatedRequestContext){return this.admin.updateProduct(id,dto,actor);}
  @Patch('products/:id/visibility') @RequirePermission('catalog.visibility') visibility(@Param('id',ParseUUIDPipe) id:string,@Body() dto:VisibilityDto,@CurrentUserContext() actor:AuthenticatedRequestContext){return this.admin.setVisibility(id,dto.visibleInMenu,actor);}
}
