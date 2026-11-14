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
import {
  PurchasesService,
  CreatePurchaseDto,
  ReceiveItemsDto,
  CreateSupplierDto,
  UpdateSupplierDto,
} from './purchases.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppPermission } from '../../common/auth/permissions';
import { PurchaseStatus } from '@prisma/client';

@Controller('api/v1/purchases')
@UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  // ==========================================
  // SUPPLIER ENDPOINTS
  // ==========================================

  @Get('suppliers')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_VIEW)
  async getSuppliers(
    @CurrentTenant() org: any,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.purchasesService.getSuppliers(org.id, {
      search,
      includeArchived: includeArchived === 'true',
    });
  }

  @Get('suppliers/:id')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_VIEW)
  async getSupplierById(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.purchasesService.getSupplierById(org.id, id);
  }

  @Post('suppliers')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_MANAGE)
  async createSupplier(@CurrentTenant() org: any, @Body() data: CreateSupplierDto) {
    return this.purchasesService.createSupplier(org.id, data);
  }

  @Patch('suppliers/:id')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_MANAGE)
  async updateSupplier(
    @CurrentTenant() org: any,
    @Param('id') id: string,
    @Body() data: UpdateSupplierDto,
  ) {
    return this.purchasesService.updateSupplier(org.id, id, data);
  }

  @Delete('suppliers/:id')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_MANAGE)
  async archiveSupplier(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.purchasesService.archiveSupplier(org.id, id);
  }

  @Patch('suppliers/:id/restore')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_MANAGE)
  async restoreSupplier(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.purchasesService.restoreSupplier(org.id, id);
  }

  // ==========================================
  // PURCHASE ORDER ENDPOINTS
  // ==========================================

  @Get()
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.PURCHASES_VIEW)
  async getPurchases(
    @CurrentTenant() org: any,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: PurchaseStatus,
    @Query('search') search?: string,
  ) {
    return this.purchasesService.getPurchases(org.id, { supplierId, status, search });
  }

  @Get(':id')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.PURCHASES_VIEW)
  async getPurchaseById(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.purchasesService.getPurchaseById(org.id, id);
  }

  @Post()
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_MANAGE)
  async createPurchase(@CurrentTenant() org: any, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.createPurchase(org.id, dto);
  }

  @Post(':id/receive')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.PURCHASES_RECEIVE)
  async receiveStock(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReceiveItemsDto,
  ) {
    return this.purchasesService.receiveStock(org.id, user.id, id, dto);
  }
}
