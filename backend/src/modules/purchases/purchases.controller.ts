import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PurchasesService, CreatePurchaseDto, ReceiveItemsDto } from './purchases.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/purchases')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get('suppliers')
  async getSuppliers(@CurrentTenant() org: any) {
    return this.purchasesService.getSuppliers(org.id);
  }

  @Post('suppliers')
  @Roles('owner', 'manager')
  async createSupplier(@CurrentTenant() org: any, @Body() data: any) {
    return this.purchasesService.createSupplier(org.id, data);
  }

  @Get()
  async getPurchases(@CurrentTenant() org: any) {
    return this.purchasesService.getPurchases(org.id);
  }

  @Post()
  @Roles('owner', 'manager')
  async createPurchase(@CurrentTenant() org: any, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.createPurchase(org.id, dto);
  }

  @Post(':id/receive')
  @Roles('owner', 'manager', 'inventory_staff')
  async receiveStock(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReceiveItemsDto,
  ) {
    return this.purchasesService.receiveStock(org.id, user.id, id, dto);
  }
}
