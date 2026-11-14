import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRole, AppRole } from '../../common/auth/permissions';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executive Financial Dashboard: Full visibility for Owner; Operational sales for Manager.
   * Cashier & Inventory Staff are strictly forbidden from this endpoint.
   */
  async getDashboardSummary(organizationId: string, userRole: string) {
    const role = normalizeRole(userRole);
    if (role === AppRole.CASHIER || role === AppRole.INVENTORY_STAFF) {
      throw new ForbiddenException(
        'Access denied: Financial dashboard reports are restricted to business owners and managers.',
      );
    }

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

    // Owner gets full gross profit, net margin, and valuation
    if (role === AppRole.OWNER) {
      let cogsMonth = 0;
      for (const sale of salesMonth) {
        for (const item of sale.items) {
          cogsMonth += Number(item.costPriceSnapshot) * Number(item.quantity);
        }
      }
      const grossProfitMonth = totalSalesMonth - cogsMonth;
      const netProfit = grossProfitMonth - totalExpensesMonth;

      const ownerData = {
        role: 'owner',
        salesToday: totalSalesToday,
        salesCountToday: salesToday.length,
        salesTodayCount: salesToday.length,
        salesMonth: totalSalesMonth,
        salesCountMonth: salesMonth.length,
        salesMonthCount: salesMonth.length,
        cogsMonth,
        grossProfitMonth,
        expensesMonth: totalExpensesMonth,
        netProfit,
        netMargin: totalSalesMonth > 0 ? (netProfit / totalSalesMonth) * 100 : 0,
        lowStockCount,
        totalProducts: products.length,
        inventoryValuation,
      };

      return {
        ...ownerData,
        kpi: ownerData,
      };
    }

    // Manager gets operational metrics (sales volume, transactions, expenses, inventory count)
    // Wholesale COGS and Net Profit are masked for Manager
    const managerData = {
      role: 'manager',
      salesToday: totalSalesToday,
      salesCountToday: salesToday.length,
      salesTodayCount: salesToday.length,
      salesMonth: totalSalesMonth,
      salesCountMonth: salesMonth.length,
      salesMonthCount: salesMonth.length,
      expensesMonth: totalExpensesMonth,
      lowStockCount,
      totalProducts: products.length,
    };

    return {
      ...managerData,
      kpi: managerData,
    };
  }

  /**
   * Cashier-specific dashboard summary:
   * Returns only own sales volume, own transaction count, and recent receipts for today.
   * Completely excludes wholesale cost price, expenses, profit, and other cashiers' data.
   */
  async getCashierSummary(organizationId: string, cashierUserId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const ownSalesToday = await this.prisma.sale.findMany({
      where: {
        organizationId,
        cashierUserId,
        createdAt: { gte: todayStart },
      },
      include: {
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalAmountToday = ownSalesToday.reduce((sum, s) => sum + Number(s.totalAmount), 0);

    return {
      role: 'cashier',
      totalSales: totalAmountToday,
      todaySalesTotal: totalAmountToday,
      salesCount: ownSalesToday.length,
      todayReceiptsCount: ownSalesToday.length,
      recentSales: ownSalesToday.slice(0, 5).map((s) => ({
        id: s.id,
        receiptNumber: s.receiptNumber,
        total: Number(s.totalAmount),
        totalAmount: Number(s.totalAmount),
        paymentMethod: s.payments?.[0]?.method || 'CASH',
        createdAt: s.createdAt,
        status: s.status,
      })),
      recentReceipts: ownSalesToday.slice(0, 5).map((s) => ({
        id: s.id,
        receiptNumber: s.receiptNumber,
        total: Number(s.totalAmount),
        totalAmount: Number(s.totalAmount),
        paymentMethod: s.payments?.[0]?.method || 'CASH',
        createdAt: s.createdAt,
        status: s.status,
      })),
    };
  }

  /**
   * Inventory Staff summary:
   * Returns warehouse stock status, low stock list, and recent movements.
   * Completely excludes sales revenue, profits, and expense reports.
   */
  async getInventorySummary(organizationId: string) {
    const products = await this.prisma.product.findMany({
      where: { organizationId, isArchived: false },
      include: {
        category: { select: { id: true, name: true } },
        inventory: true,
      },
    });

    const lowStockItems: any[] = [];
    for (const p of products) {
      const onHand = Number(p.inventory?.quantityOnHand || 0);
      const threshold = Number(p.minStockThreshold);
      if (onHand <= threshold) {
        lowStockItems.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category?.name,
          quantityOnHand: onHand,
          minStockThreshold: threshold,
        });
      }
    }

    const recentMovements = await this.prisma.inventoryMovement.findMany({
      where: { organizationId },
      include: {
        product: { select: { name: true, sku: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      role: 'inventory_staff',
      totalProducts: products.length,
      lowStockCount: lowStockItems.length,
      outOfStockCount: lowStockItems.filter((i) => i.quantityOnHand === 0).length,
      lowStockItems,
      lowStockProducts: lowStockItems.map((item) => ({
        ...item,
        stockOnHand: item.quantityOnHand,
      })),
      recentMovements: recentMovements.map((m) => ({
        id: m.id,
        productName: m.product.name,
        product: { name: m.product.name, sku: m.product.sku },
        sku: m.product.sku,
        type: m.type,
        quantity: Number(m.quantity),
        reason: m.reason,
        createdAt: m.createdAt,
      })),
    };
  }

  async getDailySalesChart(organizationId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const sales = await this.prisma.sale.findMany({
      where: {
        organizationId,
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by Day
    const daysMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split('T')[0];
      daysMap[key] = 0;
    }

    for (const s of sales) {
      const key = s.createdAt.toISOString().split('T')[0];
      if (daysMap[key] !== undefined) {
        daysMap[key] += Number(s.totalAmount);
      }
    }

    return Object.entries(daysMap).map(([date, total]) => ({
      date,
      total,
    }));
  }
}
