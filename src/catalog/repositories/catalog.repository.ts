import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ListProductsQueryDto } from '../dto/list-products-query.dto.js';
import { Category } from '../entities/category.entity.js';
import { Product } from '../entities/product.entity.js';

@Injectable()
export class CatalogRepository {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}
  listActiveCategories(): Promise<Category[]> {
    return this.categories.find({
      where: { active: true },
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });
  }
  listVisibleProducts(
    query: ListProductsQueryDto,
  ): Promise<[Product[], number]> {
    const builder = this.visibleProducts();
    if (query.categoryId)
      builder.andWhere('category.id = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.search?.trim())
      builder.andWhere(
        "(product.name ILIKE :search ESCAPE E'\\\\' OR product.description ILIKE :search ESCAPE E'\\\\')",
        { search: `%${query.search.trim().replace(/[\\%_]/g, '\\$&')}%` },
      );
    return builder
      .orderBy('product.sortOrder', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 20))
      .take(query.limit ?? 20)
      .getManyAndCount();
  }
  findVisibleProduct(id: string): Promise<Product | null> {
    return this.visibleProducts().andWhere('product.id = :id', { id }).getOne();
  }
  private visibleProducts() {
    return this.products
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.category', 'category')
      .where('product.active = :active', { active: true })
      .andWhere('product.visibleInMenu = :visible', { visible: true })
      .andWhere('category.active = :categoryActive', { categoryActive: true });
  }
}
