import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductResponseDto } from './dto/product-response.dto.js';
import { Category } from './entities/category.entity.js';
import { Product } from './entities/product.entity.js';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async listCategories() {
    return (await this.listActiveCategories()).map(
      ({ id, name, sortOrder }) => ({ id, name, sortOrder }),
    );
  }

  async listProducts(query: ListProductsQueryDto) {
    const [products, total] = await this.listVisibleProducts(query);
    return {
      items: products.map((product) => this.toProductResponse(product)),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  async getProduct(id: string) {
    const product = await this.findVisibleProduct(id);
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return this.toProductResponse(product);
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
      category: { id: product.category.id, name: product.category.name },
      tracksInventory: product.tracksInventory,
      sortOrder: product.sortOrder,
    };
  }

  private listActiveCategories(): Promise<Category[]> {
    return this.categories.find({
      where: { active: true },
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });
  }

  private listVisibleProducts(
    query: ListProductsQueryDto,
  ): Promise<[Product[], number]> {
    const builder = this.visibleProducts();
    if (query.categoryId)
      builder.andWhere('category.id = :categoryId', {
        categoryId: query.categoryId,
      });
    const search = query.search?.trim();
    if (search)
      builder.andWhere(
        String.raw`(product.name ILIKE :search ESCAPE E'\\' OR product.description ILIKE :search ESCAPE E'\\')`,
        {
          search: `%${search.replace(/[\\%_]/g, String.raw`\$&`)}%`,
        },
      );
    return builder
      .orderBy('product.sortOrder', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .addOrderBy('product.id', 'ASC')
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 20))
      .take(query.limit ?? 20)
      .getManyAndCount();
  }

  private findVisibleProduct(id: string): Promise<Product | null> {
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
