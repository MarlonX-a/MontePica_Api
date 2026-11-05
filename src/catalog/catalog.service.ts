import { Injectable, NotFoundException } from '@nestjs/common';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductResponseDto } from './dto/product-response.dto.js';
import { Product } from './entities/product.entity.js';
import { CatalogRepository } from './repositories/catalog.repository.js';

@Injectable()
export class CatalogService {
  constructor(private readonly catalog: CatalogRepository) {}
  async listCategories() {
    return (await this.catalog.listActiveCategories()).map(
      ({ id, name, sortOrder }) => ({ id, name, sortOrder }),
    );
  }
  async listProducts(query: ListProductsQueryDto) {
    const [products, total] = await this.catalog.listVisibleProducts(query);
    return {
      items: products.map((product) => this.toProductResponse(product)),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }
  async getProduct(id: string) {
    const product = await this.catalog.findVisibleProduct(id);
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
}
