import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ExpensesService, CreateExpenseDto } from './expenses.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/v1/expenses')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
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
  async getCategories() {
    return this.expensesService.getExpenseCategories();
  }

  @Post()
  @Roles('owner', 'manager')
  async createExpense(@CurrentTenant() org: any, @Body() dto: CreateExpenseDto) {
    return this.expensesService.createExpense(org.id, dto);
  }
}
