import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductsService, CreateProductDto, UpdateProductDto } from './products.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/products')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(
    @CurrentTenant() org: any,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.productsService.getProducts(org.id, {
      search,
      categoryId,
      lowStock: lowStock === 'true',
    });
  }

  @Get('lookup')
  async lookupBarcode(
    @CurrentTenant() org: any,
    @Query('q') query: string,
  ) {
    return this.productsService.findByBarcodeOrSku(org.id, query);
  }

  @Get('categories')
  async getCategories(@CurrentTenant() org: any) {
    return this.productsService.getCategories(org.id);
  }

  @Post('categories')
  @Roles('owner', 'manager', 'inventory_staff')
  async createCategory(
    @CurrentTenant() org: any,
    @Body() body: { name: string; description?: string },
  ) {
    return this.productsService.createCategory(org.id, body.name, body.description);
  }

  @Get(':id')
  async getProduct(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.productsService.getProductById(org.id, id);
  }

  @Post()
  @Roles('owner', 'manager', 'inventory_staff')
  async createProduct(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(org.id, user.id, dto);
  }

  @Patch(':id')
  @Roles('owner', 'manager', 'inventory_staff')
  async updateProduct(
    @CurrentTenant() org: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(org.id, id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'manager')
  async archiveProduct(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.productsService.archiveProduct(org.id, id);
  }
}
