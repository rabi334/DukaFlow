import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SalesService, CheckoutDto } from './sales.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/sales')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('checkout')
  async checkout(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @Body() dto: CheckoutDto,
  ) {
    return this.salesService.checkout(org.id, user.id, dto);
  }

  @Get()
  async getSales(
    @CurrentTenant() org: any,
    @Query('cashierId') cashierId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.getSales(org.id, {
      cashierId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  async getSaleById(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.salesService.getSaleById(org.id, id);
  }
}
