import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { SalesService, CheckoutDto } from './sales.service';
import { ProcessReturnDto } from './dto/return.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { AppPermission, normalizeRole, AppRole } from '../../common/auth/permissions';
import { sanitizeSaleForRole, sanitizeSalesForRole } from '../../common/auth/data-sanitizer';

@Controller('api/v1/sales')
@UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('checkout')
  @Roles('owner', 'manager', 'cashier')
  @RequirePermissions(AppPermission.POS_CHECKOUT)
  async checkout(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @CurrentMembership() membership: any,
    @Body() dto: CheckoutDto,
  ) {
    const sale = await this.salesService.checkout(org.id, user.id, dto);
    return sanitizeSaleForRole(sale, membership.role);
  }

  @Get('returns')
  @Roles('owner', 'manager', 'cashier')
  async getReturns(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @CurrentMembership() membership: any,
    @Query('saleId') saleId?: string,
    @Query('cashierId') cashierId?: string,
    @Query('limit') limit?: string,
  ) {
    const role = normalizeRole(membership.role);

    if (role === AppRole.INVENTORY_STAFF) {
      throw new ForbiddenException('Access denied: Inventory staff cannot access returns history');
    }

    const effectiveCashierId = role === AppRole.CASHIER ? user.id : cashierId;

    return this.salesService.getReturns(org.id, {
      saleId,
      cashierId: effectiveCashierId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get()
  @Roles('owner', 'manager', 'cashier')
  async getSales(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @CurrentMembership() membership: any,
    @Query('cashierId') cashierId?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const role = normalizeRole(membership.role);

    // Inventory staff is completely forbidden from accessing sales ledger
    if (role === AppRole.INVENTORY_STAFF) {
      throw new ForbiddenException('Access denied: Inventory staff cannot access sales history');
    }

    // Role-Aware Sales History:
    // Cashiers can ONLY view their own sales records. Even if they provide another cashierId,
    // enforce their own user ID.
    const effectiveCashierId = role === AppRole.CASHIER ? user.id : cashierId;

    const sales = await this.salesService.getSales(org.id, {
      cashierId: effectiveCashierId,
      search,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    // Sanitize costPriceSnapshot and line profit for Cashiers
    return sanitizeSalesForRole(sales, membership.role);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'cashier')
  async getSaleById(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @CurrentMembership() membership: any,
    @Param('id') id: string,
  ) {
    const role = normalizeRole(membership.role);

    if (role === AppRole.INVENTORY_STAFF) {
      throw new ForbiddenException('Access denied: Inventory staff cannot access sales records');
    }

    const sale = await this.salesService.getSaleById(org.id, id);

    // Cashiers can only inspect their own receipts
    if (role === AppRole.CASHIER && sale.cashierUserId !== user.id) {
      throw new ForbiddenException('Access denied: Cashiers can only access their own sales receipts');
    }

    return sanitizeSaleForRole(sale, membership.role);
  }

  @Post(':id/return')
  @Roles('owner', 'manager', 'cashier')
  @RequirePermissions(AppPermission.POS_CHECKOUT)
  async processReturn(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @CurrentMembership() membership: any,
    @Param('id') id: string,
    @Body() dto: ProcessReturnDto,
  ) {
    const role = normalizeRole(membership.role);

    if (role === AppRole.INVENTORY_STAFF) {
      throw new ForbiddenException('Access denied: Inventory staff cannot process returns');
    }

    return this.salesService.processReturn(org.id, user.id, id, dto);
  }
}
