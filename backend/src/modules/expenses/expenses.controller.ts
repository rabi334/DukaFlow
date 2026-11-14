import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ExpensesService, CreateExpenseDto } from './expenses.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { AppPermission } from '../../common/auth/permissions';

@Controller('api/v1/expenses')
@UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.EXPENSES_VIEW)
  async getExpenses(
    @CurrentTenant() org: any,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    return this.expensesService.getExpenses(org.id, {
      category,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('categories')
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.EXPENSES_VIEW)
  async getCategories() {
    return this.expensesService.getExpenseCategories();
  }

  @Post()
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.EXPENSES_MANAGE)
  async createExpense(@CurrentTenant() org: any, @Body() dto: CreateExpenseDto) {
    return this.expensesService.createExpense(org.id, dto);
  }
}
