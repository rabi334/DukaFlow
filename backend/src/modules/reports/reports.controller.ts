import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
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
import { ReportQueryDto, CsvExportQueryDto } from './dto/report-query.dto';

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
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getDashboardSummary(org.id, membership.role, query);
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
   * Inventory summary (alias / shortcut).
   */
  @Get('inventory-summary')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.REPORTS_VIEW_INVENTORY)
  async getInventorySummaryLegacy(@CurrentTenant() org: any) {
    return this.reportsService.getInventorySummary(org.id);
  }

  /**
   * 7-day sales chart.
   */
  @Get('charts/daily-sales')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.REPORTS_VIEW_OPERATIONAL)
  async getDailySalesChart(@CurrentTenant() org: any) {
    return this.reportsService.getDailySalesChart(org.id);
  }

  // ==========================================
  // MODULE B: SALES REPORTS
  // ==========================================
  @Get('sales/summary')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.REPORTS_VIEW_OPERATIONAL)
  async getSalesSummary(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getSalesSummary(org.id, membership.role, query);
  }

  @Get('sales/details')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.SALES_VIEW_ALL)
  async getSalesDetails(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getSalesDetails(org.id, membership.role, query);
  }

  // ==========================================
  // MODULE C: PROFIT & FINANCIAL REPORTS
  // ==========================================
  @Get('financial/profit-loss')
  @Roles('owner')
  @RequirePermissions(AppPermission.REPORTS_VIEW_FINANCIAL)
  async getProfitLoss(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getProfitAndLossReport(org.id, membership.role, query);
  }

  @Get('financial/cash-flow')
  @Roles('owner')
  @RequirePermissions(AppPermission.REPORTS_VIEW_FINANCIAL)
  async getCashFlow(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getCashFlowReport(org.id, membership.role, query);
  }

  @Get('financial/receivables')
  @Roles('owner')
  @RequirePermissions(AppPermission.REPORTS_VIEW_FINANCIAL)
  async getReceivables(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getReceivablesReport(org.id, membership.role, query);
  }

  @Get('financial/tax-summary')
  @Roles('owner')
  @RequirePermissions(AppPermission.REPORTS_VIEW_FINANCIAL)
  async getTaxSummary(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getTaxSummaryReport(org.id, membership.role, query);
  }

  // ==========================================
  // MODULE D: INVENTORY REPORTS
  // ==========================================
  @Get('inventory/summary')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.REPORTS_VIEW_INVENTORY)
  async getInventorySummary(
    @CurrentTenant() org: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getInventorySummary(org.id, query);
  }

  @Get('inventory/valuation')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.INVENTORY_VIEW)
  async getInventoryValuation(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getInventoryValuationReport(org.id, membership.role, query);
  }

  @Get('inventory/movements')
  @Roles('owner', 'manager', 'inventory_staff')
  @RequirePermissions(AppPermission.INVENTORY_VIEW)
  async getInventoryMovements(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getInventoryMovementsReport(org.id, membership.role, query);
  }

  @Get('inventory/product-performance')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.REPORTS_VIEW_OPERATIONAL)
  async getProductPerformance(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getProductPerformanceReport(org.id, membership.role, query);
  }

  // ==========================================
  // MODULE E: PURCHASE REPORTS
  // ==========================================
  @Get('purchases/summary')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_VIEW)
  async getPurchasesSummary(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getPurchasesSummary(org.id, membership.role, query);
  }

  @Get('purchases/suppliers')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_VIEW)
  async getPurchasesSuppliers(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getPurchasesSuppliers(org.id, membership.role, query);
  }

  @Get('purchases/history')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.PURCHASES_VIEW)
  async getPurchasesHistory(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getPurchasesHistory(org.id, membership.role, query);
  }

  // ==========================================
  // MODULE F: EXPENSE REPORTS
  // ==========================================
  @Get('expenses/summary')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.EXPENSES_VIEW)
  async getExpensesSummary(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getExpensesSummary(org.id, membership.role, query);
  }

  // ==========================================
  // MODULE G: STAFF PERFORMANCE REPORTS
  // ==========================================
  @Get('staff/performance')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.STAFF_VIEW)
  async getStaffPerformance(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getStaffPerformanceReport(org.id, membership.role, query);
  }

  // ==========================================
  // CSV EXPORT SERVICE
  // ==========================================
  @Get('export/csv')
  @Roles('owner', 'manager', 'cashier', 'inventory_staff')
  async exportCsv(
    @CurrentTenant() org: any,
    @CurrentMembership() membership: any,
    @Query() query: CsvExportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.exportReportCsv(org.id, membership.role, query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.csv);
  }
}
