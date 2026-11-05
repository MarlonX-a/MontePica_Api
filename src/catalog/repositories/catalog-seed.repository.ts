import type { EntityManager } from 'typeorm';
export class CatalogSeedRepository {
  async insertCategoryIfMissing(
    manager: EntityManager,
    category: { normalizedName: string; name: string; sortOrder: number },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO categoria(nombre_normalizado,nombre,activa,orden) VALUES($1,$2,true,$3) ON CONFLICT(nombre_normalizado) DO NOTHING`,
      [category.normalizedName, category.name, category.sortOrder],
    );
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
    await manager.query(
      `INSERT INTO producto(id_categoria,sku,nombre,descripcion,precio_ctvs,imagen_url,activo,visible_menu,controla_inventario,orden) SELECT id_categoria,$2,$3,$4,$5,NULL,true,true,true,$6 FROM categoria WHERE nombre_normalizado=$1 ON CONFLICT(sku) DO NOTHING`,
      [
        product.category,
        product.sku,
        product.name,
        product.description,
        product.priceCents,
        product.sortOrder,
      ],
    );
  }
}
