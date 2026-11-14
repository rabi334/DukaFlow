import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma, SaleStatus, PaymentMethod, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRole, AppRole } from '../../common/auth/permissions';

export const BUSINESS_TIMEZONE = 'Africa/Addis_Ababa';

/**
 * Formats a Date object as YYYY-MM-DD in the target business timezone (default: Africa/Addis_Ababa, UTC+3).
 */
export function formatToBusinessDate(date: Date, timeZone: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Calculates start-of-day, start-of-month, and half-open boundary windows
 * strictly aligned with the organization's business timezone.
 */
export function getBusinessDateBoundaries(
  referenceDate: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZoneName: 'longOffset',
  }).formatToParts(referenceDate);

  const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10);
  const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value;
  const offset = !tzName || tzName === 'GMT' ? '+00:00' : tzName.replace('GMT', '');

  const pad = (n: number) => String(n).padStart(2, '0');

  // Start of today in business timezone
  const todayStart = new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00.000${offset}`);

  // Tomorrow start (half-open boundary for today [todayStart, tomorrowStart))
  const tomorrowRef = new Date(todayStart.getTime() + 28 * 60 * 60 * 1000);
  const tParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZoneName: 'longOffset',
  }).formatToParts(tomorrowRef);
  const tYear = tParts.find((p) => p.type === 'year')!.value;
  const tMonth = tParts.find((p) => p.type === 'month')!.value.padStart(2, '0');
  const tDay = tParts.find((p) => p.type === 'day')!.value.padStart(2, '0');
  const tTz = tParts.find((p) => p.type === 'timeZoneName')?.value;
  const tOffset = !tTz || tTz === 'GMT' ? '+00:00' : tTz.replace('GMT', '');
  const tomorrowStart = new Date(`${tYear}-${tMonth}-${tDay}T00:00:00.000${tOffset}`);

  // Start of current month in business timezone (evaluating offset for day 1 of month)
  const mRef = new Date(`${year}-${pad(month)}-01T12:00:00.000Z`);
  const mParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(mRef);
  const mTz = mParts.find((p) => p.type === 'timeZoneName')?.value;
  const mOffset = !mTz || mTz === 'GMT' ? '+00:00' : mTz.replace('GMT', '');
  const monthStart = new Date(`${year}-${pad(month)}-01T00:00:00.000${mOffset}`);

  // Next month start (half-open boundary for month [monthStart, nextMonthStart))
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nmRef = new Date(`${nextYear}-${pad(nextMonth)}-01T12:00:00.000Z`);
  const nmParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(nmRef);
  const nmTz = nmParts.find((p) => p.type === 'timeZoneName')?.value;
  const nmOffset = !nmTz || nmTz === 'GMT' ? '+00:00' : nmTz.replace('GMT', '');
  const nextMonthStart = new Date(`${nextYear}-${pad(nextMonth)}-01T00:00:00.000${nmOffset}`);

  // 7 days ago start in business timezone: exactly 6 full calendar days before todayStart
  const sevenDaysAgoStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  return {
    todayStart,
    tomorrowStart,
    monthStart,
    nextMonthStart,
    sevenDaysAgoStart,
    currentDateStr: `${year}-${pad(month)}-${pad(day)}`,
  };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executive Financial Dashboard: Full visibility for Owner; Operational sales for Manager.
   * Cashier & Inventory Staff are strictly forbidden from this endpoint.
   *
   * Accounting Standards:
   * - Gross Sales = sum of sales totalAmount for non-cancelled sales (by Sale createdAt).
   * - Refunds = sum of refundAmount from SaleReturn records in the period (by Return createdAt).
   * - Net Sales = Gross Sales - Refunds.
   * - Net Customer Cash Movement = Gross Sales - Refunds.
   * - Cost of Goods Sold (COGS) reverses original costPriceSnapshot * returnedQty ONLY if restocked === true.
   * - Gross Profit = Net Sales - Net COGS.
   * - Net Operating Profit = Gross Profit - Expenses.
   * - All date boundaries strictly follow Africa/Addis_Ababa (UTC+3).
   */
  async getDashboardSummary(organizationId: string, userRole: string) {
    const role = normalizeRole(userRole);
    if (role === AppRole.CASHIER || role === AppRole.INVENTORY_STAFF) {
      throw new ForbiddenException(
        'Access denied: Financial dashboard reports are restricted to business owners and managers.',
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const tz = org?.timezone || BUSINESS_TIMEZONE;
    const { todayStart, tomorrowStart, monthStart, nextMonthStart } = getBusinessDateBoundaries(new Date(), tz);

    // 1. Fetch Sales, Returns, Payments, Expenses, and Products using half-open intervals
    const [
      salesToday,
      returnsToday,
      paymentsToday,
      salesMonth,
      returnsMonth,
      paymentsMonth,
      expensesMonth,
      products,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: todayStart, lt: tomorrowStart },
          status: { not: SaleStatus.CANCELLED },
        },
        include: {
          items: true,
          payments: true,
          returns: { where: { status: ReturnStatus.COMPLETED } },
        },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: todayStart, lt: tomorrowStart } },
            { completedAt: null, createdAt: { gte: todayStart, lt: tomorrowStart } },
          ],
        },
        include: {
          items: {
            include: { saleItem: true },
          },
          sale: {
            select: { taxAmount: true, totalAmount: true },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          sale: {
            organizationId,
            status: { not: SaleStatus.CANCELLED },
          },
          createdAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: monthStart, lt: nextMonthStart },
          status: { not: SaleStatus.CANCELLED },
        },
        include: {
          items: true,
          payments: true,
          returns: { where: { status: ReturnStatus.COMPLETED } },
        },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: monthStart, lt: nextMonthStart } },
            { completedAt: null, createdAt: { gte: monthStart, lt: nextMonthStart } },
          ],
        },
        include: {
          items: {
            include: { saleItem: true },
          },
          sale: {
            select: { taxAmount: true, totalAmount: true },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          sale: {
            organizationId,
            status: { not: SaleStatus.CANCELLED },
          },
          createdAt: { gte: monthStart, lt: nextMonthStart },
        },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          date: { gte: monthStart, lt: nextMonthStart },
        },
      }),
      this.prisma.product.findMany({
        where: { organizationId, isArchived: false },
        include: { inventory: true },
      }),
    ]);

    // -------------------------------------------------------------
    // Invoiced Sales Revenue vs Return Credits (Accrual Sales Metrics)
    // -------------------------------------------------------------
    let grossSalesToday = new Prisma.Decimal(0);
    for (const s of salesToday) {
      grossSalesToday = grossSalesToday.plus(s.totalAmount);
    }
    let refundsToday = new Prisma.Decimal(0);
    for (const r of returnsToday) {
      const creditAmt = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      refundsToday = refundsToday.plus(creditAmt);
    }
    const netSalesToday = grossSalesToday.minus(refundsToday);

    let grossSalesMonth = new Prisma.Decimal(0);
    for (const s of salesMonth) {
      grossSalesMonth = grossSalesMonth.plus(s.totalAmount);
    }
    let refundsMonth = new Prisma.Decimal(0);
    for (const r of returnsMonth) {
      const creditAmt = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      refundsMonth = refundsMonth.plus(creditAmt);
    }
    const netSalesMonth = grossSalesMonth.minus(refundsMonth);

    // -------------------------------------------------------------
    // Actual Customer Payments & Disbursements (Cash Flow Metrics)
    // -------------------------------------------------------------
    let customerPaymentsReceivedToday = new Prisma.Decimal(0);
    let cashReceivedToday = new Prisma.Decimal(0);
    for (const p of paymentsToday) {
      const pAmt = new Prisma.Decimal(p.amount);
      customerPaymentsReceivedToday = customerPaymentsReceivedToday.plus(pAmt);
      if (p.method === PaymentMethod.CASH) {
        cashReceivedToday = cashReceivedToday.plus(pAmt);
      }
    }

    let refundsDisbursedToday = new Prisma.Decimal(0);
    let customerCreditDisbursedToday = new Prisma.Decimal(0);
    let cashRefundsToday = new Prisma.Decimal(0);
    let unpaidBalancesCancelledToday = new Prisma.Decimal(0);
    for (const r of returnsToday) {
      const disbursedAmt = new Prisma.Decimal(r.refundDisbursed || r.refundAmount);
      const creditDisbursedAmt = new Prisma.Decimal(r.customerCreditDisbursed || 0);
      const totalPayoutAmt = disbursedAmt.plus(creditDisbursedAmt);
      refundsDisbursedToday = refundsDisbursedToday.plus(disbursedAmt);
      customerCreditDisbursedToday = customerCreditDisbursedToday.plus(creditDisbursedAmt);
      if (r.unpaidCancelled) {
        unpaidBalancesCancelledToday = unpaidBalancesCancelledToday.plus(new Prisma.Decimal(r.unpaidCancelled));
      }
      if (r.refundMethod === PaymentMethod.CASH) {
        cashRefundsToday = cashRefundsToday.plus(totalPayoutAmt);
      }
    }
    const netCustomerPaymentMovementToday = customerPaymentsReceivedToday.minus(
      refundsDisbursedToday.plus(customerCreditDisbursedToday),
    );
    const netCashMovementToday = cashReceivedToday.minus(cashRefundsToday);

    // Outstanding balances and customer credits payable calculation for Today's Sales
    let outstandingCustomerBalancesToday = new Prisma.Decimal(0);
    let customerCreditsPayableToday = new Prisma.Decimal(0);
    for (const s of salesToday) {
      const invoiced = new Prisma.Decimal(s.totalAmount);
      const paid = s.payments.reduce((acc, p) => acc.add(new Prisma.Decimal(p.amount)), new Prisma.Decimal(0));
      const returnCredit = s.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.returnCredit || r.refundAmount)),
        new Prisma.Decimal(0),
      );
      const disbursed = s.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.refundDisbursed || r.refundAmount)),
        new Prisma.Decimal(0),
      );
      const creditDisbursed = s.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.customerCreditDisbursed || 0)),
        new Prisma.Decimal(0),
      );
      const effectiveInvoice = Prisma.Decimal.max(new Prisma.Decimal(0), invoiced.sub(returnCredit));
      const netPaid = paid.sub(disbursed).sub(creditDisbursed);
      const netOwed = effectiveInvoice.sub(netPaid);
      if (netOwed.gt(0)) {
        outstandingCustomerBalancesToday = outstandingCustomerBalancesToday.add(netOwed);
      } else if (netOwed.lt(0)) {
        customerCreditsPayableToday = customerCreditsPayableToday.add(netOwed.abs());
      }
    }

    let customerPaymentsReceivedMonth = new Prisma.Decimal(0);
    let cashReceivedMonth = new Prisma.Decimal(0);
    for (const p of paymentsMonth) {
      const pAmt = new Prisma.Decimal(p.amount);
      customerPaymentsReceivedMonth = customerPaymentsReceivedMonth.plus(pAmt);
      if (p.method === PaymentMethod.CASH) {
        cashReceivedMonth = cashReceivedMonth.plus(pAmt);
      }
    }

    let refundsDisbursedMonth = new Prisma.Decimal(0);
    let customerCreditDisbursedMonth = new Prisma.Decimal(0);
    let cashRefundsMonth = new Prisma.Decimal(0);
    let unpaidBalancesCancelledMonth = new Prisma.Decimal(0);
    for (const r of returnsMonth) {
      const disbursedAmt = new Prisma.Decimal(r.refundDisbursed || r.refundAmount);
      const creditDisbursedAmt = new Prisma.Decimal(r.customerCreditDisbursed || 0);
      const totalPayoutAmt = disbursedAmt.plus(creditDisbursedAmt);
      refundsDisbursedMonth = refundsDisbursedMonth.plus(disbursedAmt);
      customerCreditDisbursedMonth = customerCreditDisbursedMonth.plus(creditDisbursedAmt);
      if (r.unpaidCancelled) {
        unpaidBalancesCancelledMonth = unpaidBalancesCancelledMonth.plus(new Prisma.Decimal(r.unpaidCancelled));
      }
      if (r.refundMethod === PaymentMethod.CASH) {
        cashRefundsMonth = cashRefundsMonth.plus(totalPayoutAmt);
      }
    }
    const netCustomerPaymentMovementMonth = customerPaymentsReceivedMonth.minus(
      refundsDisbursedMonth.plus(customerCreditDisbursedMonth),
    );
    const netCashMovementMonth = cashReceivedMonth.minus(cashRefundsMonth);

    // Outstanding balances and customer credits payable calculation for Month's Sales
    let outstandingCustomerBalancesMonth = new Prisma.Decimal(0);
    let customerCreditsPayableMonth = new Prisma.Decimal(0);
    for (const s of salesMonth) {
      const invoiced = new Prisma.Decimal(s.totalAmount);
      const paid = s.payments.reduce((acc, p) => acc.add(new Prisma.Decimal(p.amount)), new Prisma.Decimal(0));
      const returnCredit = s.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.returnCredit || r.refundAmount)),
        new Prisma.Decimal(0),
      );
      const disbursed = s.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.refundDisbursed || r.refundAmount)),
        new Prisma.Decimal(0),
      );
      const creditDisbursed = s.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.customerCreditDisbursed || 0)),
        new Prisma.Decimal(0),
      );
      const effectiveInvoice = Prisma.Decimal.max(new Prisma.Decimal(0), invoiced.sub(returnCredit));
      const netPaid = paid.sub(disbursed).sub(creditDisbursed);
      const netOwed = effectiveInvoice.sub(netPaid);
      if (netOwed.gt(0)) {
        outstandingCustomerBalancesMonth = outstandingCustomerBalancesMonth.add(netOwed);
      } else if (netOwed.lt(0)) {
        customerCreditsPayableMonth = customerCreditsPayableMonth.add(netOwed.abs());
      }
    }

    // Expenses Month Arithmetic
    let totalExpensesMonth = new Prisma.Decimal(0);
    for (const e of expensesMonth) {
      totalExpensesMonth = totalExpensesMonth.plus(e.amount);
    }

    // Products & Inventory Status
    let lowStockCount = 0;
    let inventoryValuation = new Prisma.Decimal(0);

    for (const p of products) {
      const stock = new Prisma.Decimal(p.inventory?.quantityOnHand || 0);
      const threshold = new Prisma.Decimal(p.minStockThreshold);
      if (stock.lte(threshold)) {
        lowStockCount++;
      }
      inventoryValuation = inventoryValuation.plus(stock.times(p.costPrice));
    }

    // Tax & VAT Adjustments (Output VAT on sales less Output VAT attributed to refunds)
    let grossTaxMonth = new Prisma.Decimal(0);
    for (const s of salesMonth) {
      grossTaxMonth = grossTaxMonth.plus(s.taxAmount);
    }

    let refundedTaxMonth = new Prisma.Decimal(0);
    for (const r of returnsMonth) {
      if (r.sale && new Prisma.Decimal(r.sale.totalAmount).gt(0)) {
        const taxRatio = new Prisma.Decimal(r.sale.taxAmount).div(new Prisma.Decimal(r.sale.totalAmount));
        refundedTaxMonth = refundedTaxMonth.plus(new Prisma.Decimal(r.refundAmount).mul(taxRatio));
      }
    }
    refundedTaxMonth = refundedTaxMonth.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const netTaxMonth = grossTaxMonth.minus(refundedTaxMonth);

    // Owner gets full gross profit, net margin, and valuation
    if (role === AppRole.OWNER) {
      let grossCogsMonth = new Prisma.Decimal(0);
      for (const sale of salesMonth) {
        for (const item of sale.items) {
          const lineCost = new Prisma.Decimal(item.costPriceSnapshot).times(new Prisma.Decimal(item.quantity));
          grossCogsMonth = grossCogsMonth.plus(lineCost);
        }
      }

      // Restocked COGS reversal: ONLY items restocked reverse inventory cost from COGS
      let restockedCogsReversalMonth = new Prisma.Decimal(0);
      for (const ret of returnsMonth) {
        if (ret.restocked) {
          for (const retItem of ret.items) {
            const unitCost = retItem.saleItem
              ? new Prisma.Decimal(retItem.saleItem.costPriceSnapshot)
              : new Prisma.Decimal(0);
            const itemCostReversal = unitCost.times(new Prisma.Decimal(retItem.quantity));
            restockedCogsReversalMonth = restockedCogsReversalMonth.plus(itemCostReversal);
          }
        }
      }

      const netCogsMonth = grossCogsMonth.minus(restockedCogsReversalMonth);
      const grossProfitMonth = netSalesMonth.minus(netCogsMonth);
      const netProfit = grossProfitMonth.minus(totalExpensesMonth);
      const netMargin = netSalesMonth.greaterThan(0)
        ? netProfit.dividedBy(netSalesMonth).times(100).toNumber()
        : 0;

      const ownerData = {
        role: 'owner',
        salesToday: netSalesToday.toNumber(),
        grossSalesToday: grossSalesToday.toNumber(),
        refundsToday: refundsToday.toNumber(),
        netSalesToday: netSalesToday.toNumber(),
        salesCountToday: salesToday.length,
        salesTodayCount: salesToday.length,

        // Actual Payment and Cash Movement Today
        customerPaymentsReceivedToday: customerPaymentsReceivedToday.toNumber(),
        refundsDisbursedToday: refundsDisbursedToday.toNumber(),
        refundsActuallyDisbursedToday: refundsDisbursedToday.toNumber(),
        customerCreditDisbursedToday: customerCreditDisbursedToday.toNumber(),
        unpaidBalancesCancelledToday: unpaidBalancesCancelledToday.toNumber(),
        netCustomerPaymentMovementToday: netCustomerPaymentMovementToday.toNumber(),
        cashReceivedToday: cashReceivedToday.toNumber(),
        cashRefundsToday: cashRefundsToday.toNumber(),
        netCashMovementToday: netCashMovementToday.toNumber(),
        netCustomerCashMovementToday: netCashMovementToday.toNumber(), // Backwards compatibility
        outstandingCustomerBalancesToday: outstandingCustomerBalancesToday.toNumber(),
        customerCreditsPayableToday: customerCreditsPayableToday.toNumber(),

        salesMonth: netSalesMonth.toNumber(),
        grossSalesMonth: grossSalesMonth.toNumber(),
        refundsMonth: refundsMonth.toNumber(),
        netSalesMonth: netSalesMonth.toNumber(),
        salesCountMonth: salesMonth.length,
        salesMonthCount: salesMonth.length,

        // Actual Payment and Cash Movement Month
        customerPaymentsReceivedMonth: customerPaymentsReceivedMonth.toNumber(),
        refundsDisbursedMonth: refundsDisbursedMonth.toNumber(),
        refundsActuallyDisbursedMonth: refundsDisbursedMonth.toNumber(),
        customerCreditDisbursedMonth: customerCreditDisbursedMonth.toNumber(),
        unpaidBalancesCancelledMonth: unpaidBalancesCancelledMonth.toNumber(),
        netCustomerPaymentMovementMonth: netCustomerPaymentMovementMonth.toNumber(),
        cashReceivedMonth: cashReceivedMonth.toNumber(),
        cashRefundsMonth: cashRefundsMonth.toNumber(),
        netCashMovementMonth: netCashMovementMonth.toNumber(),
        netCustomerCashMovementMonth: netCashMovementMonth.toNumber(), // Backwards compatibility
        outstandingCustomerBalancesMonth: outstandingCustomerBalancesMonth.toNumber(),
        customerCreditsPayableMonth: customerCreditsPayableMonth.toNumber(),

        // Tax & VAT Adjustments (Net Output VAT After Refunds)
        grossTaxMonth: grossTaxMonth.toNumber(),
        refundedTaxMonth: refundedTaxMonth.toNumber(),
        netTaxMonth: netTaxMonth.toNumber(),
        netOutputVatAfterRefunds: netTaxMonth.toNumber(), // Clarified standard name
        vatAdjustmentMonth: refundedTaxMonth.toNumber(),

        cogsMonth: netCogsMonth.toNumber(),
        grossCogsMonth: grossCogsMonth.toNumber(),
        restockedCogsMonth: restockedCogsReversalMonth.toNumber(),
        netCogsMonth: netCogsMonth.toNumber(),

        grossProfitMonth: grossProfitMonth.toNumber(),
        expensesMonth: totalExpensesMonth.toNumber(),
        netProfit: netProfit.toNumber(),
        netMargin,
        lowStockCount,
        totalProducts: products.length,
        inventoryValuation: inventoryValuation.toNumber(),
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
      salesToday: netSalesToday.toNumber(),
      grossSalesToday: grossSalesToday.toNumber(),
      refundsToday: refundsToday.toNumber(),
      netSalesToday: netSalesToday.toNumber(),
      salesCountToday: salesToday.length,
      salesTodayCount: salesToday.length,

      // Actual Payment and Cash Movement Today
      customerPaymentsReceivedToday: customerPaymentsReceivedToday.toNumber(),
      refundsDisbursedToday: refundsDisbursedToday.toNumber(),
      refundsActuallyDisbursedToday: refundsDisbursedToday.toNumber(),
      customerCreditDisbursedToday: customerCreditDisbursedToday.toNumber(),
      unpaidBalancesCancelledToday: unpaidBalancesCancelledToday.toNumber(),
      netCustomerPaymentMovementToday: netCustomerPaymentMovementToday.toNumber(),
      cashReceivedToday: cashReceivedToday.toNumber(),
      cashRefundsToday: cashRefundsToday.toNumber(),
      netCashMovementToday: netCashMovementToday.toNumber(),
      netCustomerCashMovementToday: netCashMovementToday.toNumber(), // Backwards compatibility
      outstandingCustomerBalancesToday: outstandingCustomerBalancesToday.toNumber(),
      customerCreditsPayableToday: customerCreditsPayableToday.toNumber(),

      salesMonth: netSalesMonth.toNumber(),
      grossSalesMonth: grossSalesMonth.toNumber(),
      refundsMonth: refundsMonth.toNumber(),
      netSalesMonth: netSalesMonth.toNumber(),
      salesCountMonth: salesMonth.length,
      salesMonthCount: salesMonth.length,

      // Actual Payment and Cash Movement Month
      customerPaymentsReceivedMonth: customerPaymentsReceivedMonth.toNumber(),
      refundsDisbursedMonth: refundsDisbursedMonth.toNumber(),
      refundsActuallyDisbursedMonth: refundsDisbursedMonth.toNumber(),
      customerCreditDisbursedMonth: customerCreditDisbursedMonth.toNumber(),
      unpaidBalancesCancelledMonth: unpaidBalancesCancelledMonth.toNumber(),
      netCustomerPaymentMovementMonth: netCustomerPaymentMovementMonth.toNumber(),
      cashReceivedMonth: cashReceivedMonth.toNumber(),
      cashRefundsMonth: cashRefundsMonth.toNumber(),
      netCashMovementMonth: netCashMovementMonth.toNumber(),
      netCustomerCashMovementMonth: netCashMovementMonth.toNumber(), // Backwards compatibility
      outstandingCustomerBalancesMonth: outstandingCustomerBalancesMonth.toNumber(),
      customerCreditsPayableMonth: customerCreditsPayableMonth.toNumber(),

      // Tax & VAT Adjustments (Net Output VAT After Refunds)
      grossTaxMonth: grossTaxMonth.toNumber(),
      refundedTaxMonth: refundedTaxMonth.toNumber(),
      netTaxMonth: netTaxMonth.toNumber(),
      netOutputVatAfterRefunds: netTaxMonth.toNumber(),
      vatAdjustmentMonth: refundedTaxMonth.toNumber(),

      expensesMonth: totalExpensesMonth.toNumber(),
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
   * Accurately reflects refunds processed by cashier.
   * Completely excludes wholesale cost price, expenses, profit, and other cashiers' data.
   */
  async getCashierSummary(organizationId: string, cashierUserId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const tz = org?.timezone || BUSINESS_TIMEZONE;
    const { todayStart, tomorrowStart } = getBusinessDateBoundaries(new Date(), tz);

    const [ownSalesToday, ownReturnsToday] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          organizationId,
          cashierUserId,
          createdAt: { gte: todayStart, lt: tomorrowStart },
          status: { not: SaleStatus.CANCELLED },
        },
        include: {
          payments: true,
          returns: { where: { status: ReturnStatus.COMPLETED } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          OR: [
            { cashierUserId },
            { sale: { cashierUserId } },
          ],
          status: ReturnStatus.COMPLETED,
          AND: [
            {
              OR: [
                { completedAt: { gte: todayStart, lt: tomorrowStart } },
                { completedAt: null, createdAt: { gte: todayStart, lt: tomorrowStart } },
              ],
            },
          ],
        },
      }),
    ]);

    let grossAmountToday = new Prisma.Decimal(0);
    for (const s of ownSalesToday) {
      grossAmountToday = grossAmountToday.plus(s.totalAmount);
    }

    let refundsAmountToday = new Prisma.Decimal(0);
    for (const r of ownReturnsToday) {
      const creditAmt = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      refundsAmountToday = refundsAmountToday.plus(creditAmt);
    }

    const netAmountToday = grossAmountToday.minus(refundsAmountToday);

    // Actual Payment and Cash Movements for Cashier
    let customerPaymentsReceivedToday = new Prisma.Decimal(0);
    let cashReceivedToday = new Prisma.Decimal(0);
    for (const s of ownSalesToday) {
      for (const p of s.payments) {
        const pAmt = new Prisma.Decimal(p.amount);
        customerPaymentsReceivedToday = customerPaymentsReceivedToday.plus(pAmt);
        if (p.method === PaymentMethod.CASH) {
          cashReceivedToday = cashReceivedToday.plus(pAmt);
        }
      }
    }

    let refundsDisbursedToday = new Prisma.Decimal(0);
    let customerCreditDisbursedToday = new Prisma.Decimal(0);
    let cashRefundsToday = new Prisma.Decimal(0);
    for (const r of ownReturnsToday) {
      const disbursedAmt = new Prisma.Decimal(r.refundDisbursed || r.refundAmount);
      const creditDisbursedAmt = new Prisma.Decimal(r.customerCreditDisbursed || 0);
      const totalPayout = disbursedAmt.plus(creditDisbursedAmt);
      refundsDisbursedToday = refundsDisbursedToday.plus(disbursedAmt);
      customerCreditDisbursedToday = customerCreditDisbursedToday.plus(creditDisbursedAmt);
      if (r.refundMethod === PaymentMethod.CASH) {
        cashRefundsToday = cashRefundsToday.plus(totalPayout);
      }
    }

    const netCustomerPaymentMovementToday = customerPaymentsReceivedToday.minus(
      refundsDisbursedToday.plus(customerCreditDisbursedToday),
    );
    const netCashMovementToday = cashReceivedToday.minus(cashRefundsToday);

    return {
      role: 'cashier',
      totalSales: netAmountToday.toNumber(),
      todaySalesTotal: netAmountToday.toNumber(),
      grossSalesToday: grossAmountToday.toNumber(),
      refundsToday: refundsAmountToday.toNumber(),
      netSalesToday: netAmountToday.toNumber(),

      // Actual Payment and Cash Movement
      customerPaymentsReceivedToday: customerPaymentsReceivedToday.toNumber(),
      refundsDisbursedToday: refundsDisbursedToday.toNumber(),
      refundsActuallyDisbursedToday: refundsDisbursedToday.toNumber(),
      netCustomerPaymentMovementToday: netCustomerPaymentMovementToday.toNumber(),
      cashReceivedToday: cashReceivedToday.toNumber(),
      cashRefundsToday: cashRefundsToday.toNumber(),
      netCashMovementToday: netCashMovementToday.toNumber(),
      netCustomerCashMovementToday: netCashMovementToday.toNumber(), // Backwards compatibility

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

  /**
   * 7-day sales chart.
   * Grouped and labeled strictly according to the organization's business timezone.
   */
  async getDailySalesChart(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const tz = org?.timezone || BUSINESS_TIMEZONE;
    const { todayStart, sevenDaysAgoStart } = getBusinessDateBoundaries(new Date(), tz);

    const [sales, returns, payments] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: sevenDaysAgoStart },
          status: { not: SaleStatus.CANCELLED },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: sevenDaysAgoStart } },
            { completedAt: null, createdAt: { gte: sevenDaysAgoStart } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: {
          sale: {
            organizationId,
            status: { not: SaleStatus.CANCELLED },
          },
          createdAt: { gte: sevenDaysAgoStart },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Build the 7 daily buckets ending today in the business timezone
    const daysMap: Record<
      string,
      {
        gross: Prisma.Decimal;
        refunds: Prisma.Decimal;
        refundsDisbursed: Prisma.Decimal;
        paymentsReceived: Prisma.Decimal;
        cashReceived: Prisma.Decimal;
        cashRefunds: Prisma.Decimal;
      }
    > = {};
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(todayStart.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
      const key = formatToBusinessDate(dayDate, tz);
      daysMap[key] = {
        gross: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        refundsDisbursed: new Prisma.Decimal(0),
        paymentsReceived: new Prisma.Decimal(0),
        cashReceived: new Prisma.Decimal(0),
        cashRefunds: new Prisma.Decimal(0),
      };
    }

    for (const s of sales) {
      const key = formatToBusinessDate(s.createdAt, tz);
      if (daysMap[key]) {
        daysMap[key].gross = daysMap[key].gross.plus(s.totalAmount);
      }
    }

    for (const r of returns) {
      const returnDate = r.completedAt || r.createdAt;
      const key = formatToBusinessDate(returnDate, tz);
      if (daysMap[key]) {
        const credit = new Prisma.Decimal(r.returnCredit && Number(r.returnCredit) > 0 ? r.returnCredit : r.refundAmount);
        const disbursed = new Prisma.Decimal(r.refundDisbursed || r.refundAmount);
        const creditDisbursed = new Prisma.Decimal(r.customerCreditDisbursed || 0);
        const totalDisbursed = disbursed.plus(creditDisbursed);
        daysMap[key].refunds = daysMap[key].refunds.plus(credit);
        daysMap[key].refundsDisbursed = daysMap[key].refundsDisbursed.plus(totalDisbursed);
        if (r.refundMethod === PaymentMethod.CASH) {
          daysMap[key].cashRefunds = daysMap[key].cashRefunds.plus(totalDisbursed);
        }
      }
    }

    for (const p of payments) {
      const key = formatToBusinessDate(p.createdAt, tz);
      if (daysMap[key]) {
        daysMap[key].paymentsReceived = daysMap[key].paymentsReceived.plus(p.amount);
        if (p.method === PaymentMethod.CASH) {
          daysMap[key].cashReceived = daysMap[key].cashReceived.plus(p.amount);
        }
      }
    }

    return Object.entries(daysMap).map(([date, data]) => {
      const net = data.gross.minus(data.refunds);
      const netCashMovement = data.cashReceived.minus(data.cashRefunds);
      const netPaymentMovement = data.paymentsReceived.minus(data.refundsDisbursed);
      return {
        date,
        total: net.toNumber(),
        gross: data.gross.toNumber(),
        refunds: data.refunds.toNumber(),
        refundsDisbursed: data.refundsDisbursed.toNumber(),
        net: net.toNumber(),
        paymentsReceived: data.paymentsReceived.toNumber(),
        cashReceived: data.cashReceived.toNumber(),
        cashRefunds: data.cashRefunds.toNumber(),
        netCashMovement: netCashMovement.toNumber(),
        netPaymentMovement: netPaymentMovement.toNumber(),
      };
    });
  }
}
