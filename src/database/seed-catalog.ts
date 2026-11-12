import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, type EntityManager } from 'typeorm';
import { CatalogSeedService } from '../catalog/catalog-seed.service.js';
import { createCommandContext } from './command-context.js';

let context: import('@nestjs/common').INestApplicationContext | undefined;

const categories = [
  { name: 'Ceviches', normalizedName: 'ceviches', sortOrder: 0 },
  { name: 'Bebidas', normalizedName: 'bebidas', sortOrder: 1 },
];

const products = [
  {
    sku: 'ceviche-pescado',
    category: 'ceviches',
    name: 'Ceviche de pescado',
    description: 'Pescado fresco, limón, cebolla colorada y cilantro.',
    priceCents: 650,
    sortOrder: 0,
  },
  {
    sku: 'ceviche-camaron',
    category: 'ceviches',
    name: 'Ceviche de camarón',
    description: 'Camarones frescos con limón, tomate y cebolla.',
    priceCents: 875,
    sortOrder: 1,
  },
  {
    sku: 'ceviche-mixto',
    category: 'ceviches',
    name: 'Ceviche mixto',
    description: 'Pescado y camarón en nuestra mezcla de la casa.',
    priceCents: 950,
    sortOrder: 2,
  },
  {
    sku: 'jugo-maracuya',
    category: 'bebidas',
    name: 'Jugo de maracuyá',
    description: 'Pulpa natural, agua y un toque de azúcar.',
    priceCents: 225,
    sortOrder: 0,
  },
  {
    sku: 'limonada',
    category: 'bebidas',
    name: 'Limonada',
    description: 'Limón recién exprimido, fría y refrescante.',
    priceCents: 200,
    sortOrder: 1,
  },
  {
    sku: 'cola-personal',
    category: 'bebidas',
    name: 'Cola personal',
    description: 'Bebida gaseosa bien fría.',
    priceCents: 150,
    sortOrder: 2,
  },
];

async function seedCatalog(
  manager: EntityManager,
  service: CatalogSeedService,
): Promise<void> {
  for (const category of categories)
    await service.insertCategoryIfMissing(manager, category);
  for (const product of products)
    await service.insertProductIfMissing(manager, product);
}

try {
  context = await createCommandContext('seed');
  const dataSource = context.get(DataSource);
  await dataSource.transaction((manager) =>
    seedCatalog(manager, context!.get(CatalogSeedService)),
  );
  console.info(
    'Catálogo de ejemplo cargado. Los registros existentes se conservaron.',
  );
} catch (error) {
  console.error('No se pudo cargar el catálogo de ejemplo.', error);
  process.exitCode = 1;
} finally {
  await context?.close();
}
