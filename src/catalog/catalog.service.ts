import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Category } from './entities/category.entity.js';
import { Product } from './entities/product.entity.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductResponseDto } from './dto/product-response.dto.js';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  async listCategories() {
    const categories = await this.categories.find({
      where: { active: true },
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });
    return categories.map(({ id, name, sortOrder }) => ({ id, name, sortOrder }));
  }

  async listProducts(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.visibleProductsQuery();

    if (query.categoryId) {
      builder.andWhere('category.id = :categoryId', { categoryId: query.categoryId });
    }
    if (query.search?.trim()) {
      const literalSearch = query.search.trim().replace(/[\\%_]/g, '\\$&');
      builder.andWhere(
        "(product.name ILIKE :search ESCAPE E'\\\\' OR product.description ILIKE :search ESCAPE E'\\\\')",
        { search: `%${literalSearch}%` },
      );
    }

    const [products, total] = await builder
      .orderBy('product.sortOrder', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: products.map((product) => this.toProductResponse(product)),
      total,
      page,
      limit,
    };
  }

  async getProduct(id: string) {
    const product = await this.visibleProductsQuery()
      .andWhere('product.id = :id', { id })
      .getOne();
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return this.toProductResponse(product);
  }

  private visibleProductsQuery(): SelectQueryBuilder<Product> {
    return this.products
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.category', 'category')
      .where('product.active = :active', { active: true })
      .andWhere('product.visibleInMenu = :visible', { visible: true })
      .andWhere('category.active = :categoryActive', { categoryActive: true });
  }

  private toProductResponse(product: Product): ProductResponseDto {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      currency: 'USD',
      imageUrl: product.imageUrl,
      category: product.category ? { id: product.category.id, name: product.category.name } : null,
      tracksInventory: product.tracksInventory,
      sortOrder: product.sortOrder,
    };
  }
}
