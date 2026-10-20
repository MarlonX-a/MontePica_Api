import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CatalogService } from './catalog.service.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { CategoryResponseDto } from './dto/category-response.dto.js';
import {
  PaginatedProductsResponseDto,
  ProductResponseDto,
} from './dto/product-response.dto.js';

@ApiTags('Catálogo')
@SkipThrottle()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Lista las categorías activas del menú.' })
  @ApiOkResponse({ type: CategoryResponseDto, isArray: true })
  listCategories() {
    return this.catalog.listCategories();
  }

  @Get('products')
  @ApiOperation({ summary: 'Lista y filtra productos visibles del menú.' })
  @ApiQuery({ name: 'categoryId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ type: PaginatedProductsResponseDto })
  listProducts(@Query() query: ListProductsQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Obtiene un producto visible por su ID.' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Producto inexistente o no visible.' })
  getProduct(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.getProduct(id);
  }
}
