import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/v1/reports')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  async getDashboardSummary(@CurrentTenant() org: any) {
    return this.reportsService.getDashboardSummary(org.id);
  }

  @Get('charts/daily-sales')
  async getDailySalesChart(@CurrentTenant() org: any) {
    return this.reportsService.getDailySalesChart(org.id);
  }
}
