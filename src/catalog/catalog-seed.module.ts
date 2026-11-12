import { Module } from '@nestjs/common';
import { CatalogSeedService } from './catalog-seed.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [CatalogSeedService],
  exports: [CatalogSeedService],
})
export class CatalogSeedModule {}
