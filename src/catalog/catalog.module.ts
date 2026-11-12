import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminProductsController } from './admin-products.controller.js';
import { CatalogAdminService } from './catalog-admin.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { Category } from './entities/category.entity.js';
import { Product } from './entities/product.entity.js';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    TypeOrmModule.forFeature([Product, Category]),
  ],
  controllers: [
    AdminCategoriesController,
    AdminProductsController,
    CatalogController,
  ],
  providers: [CatalogAdminService, CatalogService],
  exports: [CatalogAdminService, CatalogService],
})
export class CatalogModule {}
