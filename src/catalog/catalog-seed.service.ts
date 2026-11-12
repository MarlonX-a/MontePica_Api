import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { Category } from './entities/category.entity.js';
import { Product } from './entities/product.entity.js';

@Injectable()
export class CatalogSeedService {
  async insertCategoryIfMissing(
    manager: EntityManager,
    category: { normalizedName: string; name: string; sortOrder: number },
  ): Promise<void> {
    await manager
      .getRepository(Category)
      .createQueryBuilder()
      .insert()
      .values([
        {
          normalizedName: category.normalizedName,
          name: category.name,
          active: true,
          sortOrder: category.sortOrder,
        },
      ])
      .onConflict('(nombre_normalizado) DO NOTHING')
      .execute();
  }

  async insertProductIfMissing(
    manager: EntityManager,
    product: {
      category: string;
      sku: string;
      name: string;
      description: string;
      priceCents: number;
      sortOrder: number;
    },
  ): Promise<void> {
    const category = await manager
      .getRepository(Category)
      .findOneBy({ normalizedName: product.category });
    if (!category) return;
    await manager
      .getRepository(Product)
      .createQueryBuilder()
      .insert()
      .values({
        category: { id: category.id },
        sku: product.sku,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        imageUrl: null,
        active: true,
        visibleInMenu: true,
        tracksInventory: true,
        sortOrder: product.sortOrder,
      })
      .onConflict('(sku) DO NOTHING')
      .execute();
  }
}
