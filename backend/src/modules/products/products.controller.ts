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
import { CreateCategoryDto } from './dto/create-product.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { AppPermission } from '../../common/auth/permissions';
import { sanitizeProductForRole, sanitizeProductsForRole } from '../../common/auth/data-sanitizer';

@Controller('api/v1/products')
@UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @RequirePermissions(AppPermission.PRODUCTS_VIEW)
  async getProducts(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('lowStock') lowStock?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const products = await this.productsService.getProducts(org.id, {
      search,
      categoryId,
      lowStock: lowStock === 'true',
      includeArchived: includeArchived === 'true',
    });
    // Protect sensitive wholesale cost prices from unauthorized roles (e.g. Cashiers)
    return sanitizeProductsForRole(products, membership.role);
  }

  @Get('lookup')
  @RequirePermissions(AppPermission.PRODUCTS_VIEW)
  async lookupBarcode(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query('q') q?: string,
    @Query('code') code?: string,
  ) {
    const searchTerm = q || code || '';
    const product = await this.productsService.findByBarcodeOrSku(org.id, searchTerm);
    return sanitizeProductForRole(product, membership.role);
  }

  @Get('categories')
  @RequirePermissions(AppPermission.PRODUCTS_VIEW)
  async getCategories(@CurrentTenant() org: any) {
    return this.productsService.getCategories(org.id);
  }

  @Post('categories')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.PRODUCTS_MANAGE)
  async createCategory(
    @CurrentTenant() org: any,
    @Body() body: CreateCategoryDto,
  ) {
    return this.productsService.createCategory(org.id, body.name, body.description);
  }

  @Get(':id')
  @RequirePermissions(AppPermission.PRODUCTS_VIEW)
  async getProduct(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Param('id') id: string,
  ) {
    const product = await this.productsService.getProductById(org.id, id);
    return sanitizeProductForRole(product, membership.role);
  }

  @Post()
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.PRODUCTS_MANAGE)
  async createProduct(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @CurrentMembership() membership: any,
    @Body() dto: CreateProductDto,
  ) {
    const product = await this.productsService.createProduct(org.id, user.id, dto);
    return sanitizeProductForRole(product, membership.role);
  }

  @Patch(':id')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.PRODUCTS_MANAGE)
  async updateProduct(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.productsService.updateProduct(org.id, id, dto);
    return sanitizeProductForRole(product, membership.role);
  }

  @Patch(':id/restore')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.PRODUCTS_MANAGE)
  async restoreProduct(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Param('id') id: string,
  ) {
    const product = await this.productsService.restoreProduct(org.id, id);
    return sanitizeProductForRole(product, membership.role);
  }

  @Delete(':id')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PRODUCTS_MANAGE)
  async archiveProduct(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.productsService.archiveProduct(org.id, id);
  }

  @Delete(':id/permanent')
  @Roles('owner')
  @RequirePermissions(AppPermission.PRODUCTS_MANAGE)
  async deleteProductPermanently(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.productsService.deleteProduct(org.id, id);
  }
}
