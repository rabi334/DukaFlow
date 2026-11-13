import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { InventoryService, StockAdjustmentDto } from './inventory.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/inventory')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async getInventoryLevels(@CurrentTenant() org: any) {
    return this.inventoryService.getInventoryLevels(org.id);
  }

  @Get('movements')
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
  async adjustStock(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @Body() dto: StockAdjustmentDto,
  ) {
    return this.inventoryService.adjustStock(org.id, user.id, dto);
  }
}
