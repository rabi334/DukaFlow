import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { InventoryService, StockAdjustmentDto } from './inventory.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppPermission } from '../../common/auth/permissions';

@Controller('api/v1/inventory')
@UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.INVENTORY_VIEW)
  async getInventoryLevels(@CurrentTenant() org: any) {
    return this.inventoryService.getInventoryLevels(org.id);
  }

  @Get('movements')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.INVENTORY_VIEW)
  async getMovements(
    @CurrentTenant() org: any,
    @Query('productId') productId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getMovements(org.id, {
      productId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('adjustments')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.INVENTORY_ADJUST)
  async adjustStock(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @Body() dto: StockAdjustmentDto,
  ) {
    return this.inventoryService.adjustStock(org.id, user.id, dto);
  }
}
