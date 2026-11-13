import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardSummary(organizationId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // 1. Sales Today & Month
    const salesToday = await this.prisma.sale.findMany({
      where: {
        organizationId,
        createdAt: { gte: todayStart },
      },
      include: { items: true },
    });

    const salesMonth = await this.prisma.sale.findMany({
      where: {
        organizationId,
        createdAt: { gte: monthStart },
      },
      include: { items: true },
    });

    const totalSalesToday = salesToday.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const totalSalesMonth = salesMonth.reduce((sum, s) => sum + Number(s.totalAmount), 0);

    // Indicative Gross Profit calculation (Revenue - Cost of Goods Sold)
    let cogsMonth = 0;
    for (const sale of salesMonth) {
      for (const item of sale.items) {
        cogsMonth += Number(item.costPriceSnapshot) * Number(item.quantity);
      }
    }
    const grossProfitMonth = totalSalesMonth - cogsMonth;

    // 2. Expenses this month
    const expensesMonth = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: monthStart },
      },
    });
    const totalExpensesMonth = expensesMonth.reduce((sum, e) => sum + Number(e.amount), 0);

    // 3. Products and Low Stock Count
    const products = await this.prisma.product.findMany({
      where: { organizationId, isArchived: false },
      include: { inventory: true },
    });

    let lowStockCount = 0;
    let inventoryValuation = 0;

    for (const p of products) {
      const stock = Number(p.inventory?.quantityOnHand || 0);
      const threshold = Number(p.minStockThreshold);
      if (stock <= threshold) {
        lowStockCount++;
      }
      inventoryValuation += stock * Number(p.costPrice);
    }

    // 4. Pending Purchases
    const pendingPurchasesCount = await this.prisma.purchase.count({
      where: {
        organizationId,
        status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] },
      },
    });

    return {
      kpi: {
        salesToday: totalSalesToday,
        salesTodayCount: salesToday.length,
        salesMonth: totalSalesMonth,
        salesMonthCount: salesMonth.length,
        grossProfitMonth,
        expensesMonth: totalExpensesMonth,
        netEstimateMonth: grossProfitMonth - totalExpensesMonth,
        totalProducts: products.length,
        lowStockCount,
        inventoryValuation,
        pendingPurchasesCount,
      },
      recentSales: salesMonth.slice(0, 5),
    };
  }

  async getDailySalesChart(organizationId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const sales = await this.prisma.sale.findMany({
      where: {
        organizationId,
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    const dayMap = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split('T')[0];
      dayMap.set(key, 0);
    }

    for (const s of sales) {
      const key = s.createdAt.toISOString().split('T')[0];
      if (dayMap.has(key)) {
        dayMap.set(key, (dayMap.get(key) || 0) + Number(s.totalAmount));
      }
    }

    return Array.from(dayMap.entries()).map(([date, total]) => ({
      date,
      sales: total,
    }));
  }
}
