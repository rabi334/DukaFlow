import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
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

@Controller('api/v1/reports')
@UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Executive / Operational Financial Dashboard Summary.
   * Restricted strictly to Owner and Manager. Cashier & Inventory Staff receive 403.
   */
  @Get('dashboard')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.REPORTS_VIEW_OPERATIONAL)
  async getDashboardSummary(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
  ) {
    return this.reportsService.getDashboardSummary(org.id, membership.role);
  }

  /**
   * Cashier-specific end-of-day summary.
   * Restricted to cashier, manager, and owner.
   */
  @Get('cashier-summary')
  @Roles('owner', 'manager', 'cashier')
  @RequirePermissions(AppPermission.REPORTS_VIEW_CASHIER)
  async getCashierSummary(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
  ) {
    return this.reportsService.getCashierSummary(org.id, user.id);
  }

  /**
   * Inventory staff summary.
   * Restricted to inventory staff, manager, and owner.
   */
  @Get('inventory-summary')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.REPORTS_VIEW_INVENTORY)
  async getInventorySummary(@CurrentTenant() org: any) {
    return this.reportsService.getInventorySummary(org.id);
  }

  /**
   * 7-day sales chart.
   * Restricted to owner and manager.
   */
  @Get('charts/daily-sales')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.REPORTS_VIEW_OPERATIONAL)
  async getDailySalesChart(@CurrentTenant() org: any) {
    return this.reportsService.getDailySalesChart(org.id);
  }
}
