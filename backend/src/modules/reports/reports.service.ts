import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, SaleStatus, PaymentMethod, ReturnStatus, PurchaseStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRole, AppRole, roleHasPermission, AppPermission } from '../../common/auth/permissions';
import { ReportQueryDto, CsvExportQueryDto, DatePreset } from './dto/report-query.dto';
import {
  resolveDatePreset,
  calculateComparison,
  generateCsvString,
  sanitizeCsvCell,
} from './utils/report-date.utils';

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

  // Start of current month in business timezone
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

  private async getOrgTimezone(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return org?.timezone || BUSINESS_TIMEZONE;
  }

  // =========================================================================
  // 1. EXECUTIVE / OPERATIONAL DASHBOARD
  // =========================================================================
  async getDashboardSummary(organizationId: string, userRole: string, query?: ReportQueryDto) {
    const role = normalizeRole(userRole);
    if (role === AppRole.CASHIER || role === AppRole.INVENTORY_STAFF) {
      throw new ForbiddenException(
        'Access denied: Financial dashboard reports are restricted to business owners and managers.',
      );
    }

    const tz = await this.getOrgTimezone(organizationId);
    const { todayStart, tomorrowStart, monthStart, nextMonthStart } = getBusinessDateBoundaries(new Date(), tz);

    // Date range resolution for period comparison
    const preset = query?.preset || DatePreset.THIS_MONTH;
    const { currentStart, currentEnd, previousStart, previousEnd, label: periodLabel } = resolveDatePreset(
      preset,
      tz,
      query?.startDate,
      query?.endDate,
    );

    // Run parallel queries: Today, Month, Current Period, Previous Period, Products, Alerts
    const [
      salesToday,
      returnsToday,
      paymentsToday,
      salesMonth,
      returnsMonth,
      paymentsMonth,
      expensesMonth,
      products,
      salesCurrent,
      returnsCurrent,
      paymentsCurrent,
      expensesCurrent,
      salesPrevious,
      returnsPrevious,
      paymentsPrevious,
      expensesPrevious,
      pendingPurchases,
      pendingReturns,
      categories,
    ] = await Promise.all([
      // Today Sales
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: todayStart, lt: tomorrowStart },
          status: { not: SaleStatus.CANCELLED },
        },
        include: { items: true, payments: true, returns: { where: { status: ReturnStatus.COMPLETED } } },
      }),
      // Today Returns
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: todayStart, lt: tomorrowStart } },
            { completedAt: null, createdAt: { gte: todayStart, lt: tomorrowStart } },
          ],
        },
        include: { items: { include: { saleItem: true } }, sale: { select: { taxAmount: true, totalAmount: true } } },
      }),
      // Today Payments
      this.prisma.payment.findMany({
        where: { sale: { organizationId, status: { not: SaleStatus.CANCELLED } }, createdAt: { gte: todayStart, lt: tomorrowStart } },
      }),
      // Month Sales
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: monthStart, lt: nextMonthStart },
          status: { not: SaleStatus.CANCELLED },
        },
        include: { items: true, payments: true, returns: { where: { status: ReturnStatus.COMPLETED } } },
      }),
      // Month Returns
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: monthStart, lt: nextMonthStart } },
            { completedAt: null, createdAt: { gte: monthStart, lt: nextMonthStart } },
          ],
        },
        include: { items: { include: { saleItem: true } }, sale: { select: { taxAmount: true, totalAmount: true } } },
      }),
      // Month Payments
      this.prisma.payment.findMany({
        where: { sale: { organizationId, status: { not: SaleStatus.CANCELLED } }, createdAt: { gte: monthStart, lt: nextMonthStart } },
      }),
      // Month Expenses
      this.prisma.expense.findMany({
        where: { organizationId, date: { gte: monthStart, lt: nextMonthStart } },
      }),
      // Products & Inventory Status
      this.prisma.product.findMany({
        where: { organizationId, isArchived: false },
        include: { inventory: true, category: true },
      }),
      // Current Period Sales
      this.prisma.sale.findMany({
        where: { organizationId, createdAt: { gte: currentStart, lt: currentEnd }, status: { not: SaleStatus.CANCELLED } },
        include: { items: { include: { product: true } }, payments: true, returns: { where: { status: ReturnStatus.COMPLETED } } },
      }),
      // Current Period Returns
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: currentStart, lt: currentEnd } },
            { completedAt: null, createdAt: { gte: currentStart, lt: currentEnd } },
          ],
        },
        include: { items: { include: { saleItem: true } }, sale: { select: { taxAmount: true, totalAmount: true } } },
      }),
      // Current Period Payments
      this.prisma.payment.findMany({
        where: { sale: { organizationId, status: { not: SaleStatus.CANCELLED } }, createdAt: { gte: currentStart, lt: currentEnd } },
      }),
      // Current Period Expenses
      this.prisma.expense.findMany({
        where: { organizationId, date: { gte: currentStart, lt: currentEnd } },
      }),
      // Previous Period Sales
      this.prisma.sale.findMany({
        where: { organizationId, createdAt: { gte: previousStart, lt: previousEnd }, status: { not: SaleStatus.CANCELLED } },
        include: { items: true, payments: true, returns: { where: { status: ReturnStatus.COMPLETED } } },
      }),
      // Previous Period Returns
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: previousStart, lt: previousEnd } },
            { completedAt: null, createdAt: { gte: previousStart, lt: previousEnd } },
          ],
        },
        include: { items: { include: { saleItem: true } }, sale: { select: { taxAmount: true, totalAmount: true } } },
      }),
      // Previous Period Payments
      this.prisma.payment.findMany({
        where: { sale: { organizationId, status: { not: SaleStatus.CANCELLED } }, createdAt: { gte: previousStart, lt: previousEnd } },
      }),
      // Previous Period Expenses
      this.prisma.expense.findMany({
        where: { organizationId, date: { gte: previousStart, lt: previousEnd } },
      }),
      // Pending Purchases Alert
      this.prisma.purchase.findMany({
        where: { organizationId, status: { in: [PurchaseStatus.ORDERED, PurchaseStatus.PARTIALLY_RECEIVED] } },
        include: { supplier: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Unresolved Returns Alert
      this.prisma.saleReturn.findMany({
        where: { organizationId, status: ReturnStatus.PENDING },
        include: { sale: { select: { receiptNumber: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      // Categories
      this.prisma.category.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      }),
    ]);

    // --- ACCRUAL SALES METRICS (TODAY & MONTH) ---
    let grossSalesToday = new Prisma.Decimal(0);
    for (const s of salesToday) grossSalesToday = grossSalesToday.plus(s.totalAmount);
    let refundsToday = new Prisma.Decimal(0);
    for (const r of returnsToday) {
      const creditAmt = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      refundsToday = refundsToday.plus(creditAmt);
    }
    const netSalesToday = grossSalesToday.minus(refundsToday);

    let grossSalesMonth = new Prisma.Decimal(0);
    for (const s of salesMonth) grossSalesMonth = grossSalesMonth.plus(s.totalAmount);
    let refundsMonth = new Prisma.Decimal(0);
    for (const r of returnsMonth) {
      const creditAmt = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      refundsMonth = refundsMonth.plus(creditAmt);
    }
    const netSalesMonth = grossSalesMonth.minus(refundsMonth);

    // --- CASH FLOW & PAYMENT MOVEMENT (TODAY & MONTH) ---
    let customerPaymentsReceivedToday = new Prisma.Decimal(0);
    let cashReceivedToday = new Prisma.Decimal(0);
    for (const p of paymentsToday) {
      const pAmt = new Prisma.Decimal(p.amount);
      customerPaymentsReceivedToday = customerPaymentsReceivedToday.plus(pAmt);
      if (p.method === PaymentMethod.CASH) cashReceivedToday = cashReceivedToday.plus(pAmt);
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

    // Outstanding balances & customer credit liabilities
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
      if (p.method === PaymentMethod.CASH) cashReceivedMonth = cashReceivedMonth.plus(pAmt);
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

    let totalExpensesMonth = new Prisma.Decimal(0);
    for (const e of expensesMonth) totalExpensesMonth = totalExpensesMonth.plus(e.amount);

    // Products & Inventory Status
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let inventoryValuation = new Prisma.Decimal(0);
    const lowStockAlertList: any[] = [];
    const outOfStockAlertList: any[] = [];
    const approachingThresholdAlertList: any[] = [];

    for (const p of products) {
      const stock = new Prisma.Decimal(p.inventory?.quantityOnHand || 0);
      const threshold = new Prisma.Decimal(p.minStockThreshold);
      if (stock.eq(0)) {
        outOfStockCount++;
        outOfStockAlertList.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stockOnHand: 0,
          minStockThreshold: threshold.toNumber(),
          category: p.category?.name,
        });
      } else if (stock.lte(threshold)) {
        lowStockCount++;
        lowStockAlertList.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stockOnHand: stock.toNumber(),
          minStockThreshold: threshold.toNumber(),
          category: p.category?.name,
        });
      } else if (stock.lte(threshold.mul(1.5))) {
        approachingThresholdAlertList.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stockOnHand: stock.toNumber(),
          minStockThreshold: threshold.toNumber(),
          category: p.category?.name,
        });
      }
      inventoryValuation = inventoryValuation.plus(stock.times(p.costPrice));
    }

    // Tax & VAT Adjustments
    let grossTaxMonth = new Prisma.Decimal(0);
    for (const s of salesMonth) grossTaxMonth = grossTaxMonth.plus(s.taxAmount);
    let refundedTaxMonth = new Prisma.Decimal(0);
    for (const r of returnsMonth) {
      if (r.sale && new Prisma.Decimal(r.sale.totalAmount).gt(0)) {
        const taxRatio = new Prisma.Decimal(r.sale.taxAmount).div(new Prisma.Decimal(r.sale.totalAmount));
        const credit = (r.returnCredit !== null && r.returnCredit !== undefined)
          ? new Prisma.Decimal(r.returnCredit)
          : new Prisma.Decimal(r.refundAmount);
        refundedTaxMonth = refundedTaxMonth.plus(credit.mul(taxRatio));
      }
    }
    refundedTaxMonth = refundedTaxMonth.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const netTaxMonth = grossTaxMonth.minus(refundedTaxMonth);

    // --- PERIOD OVER PERIOD COMPARISONS (CURRENT VS PREVIOUS) ---
    // 1. Gross & Net Sales
    let curGross = new Prisma.Decimal(0);
    for (const s of salesCurrent) curGross = curGross.plus(s.totalAmount);
    let curReturns = new Prisma.Decimal(0);
    for (const r of returnsCurrent) {
      const credit = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      curReturns = curReturns.plus(credit);
    }
    const curNet = curGross.minus(curReturns);

    let prevGross = new Prisma.Decimal(0);
    for (const s of salesPrevious) prevGross = prevGross.plus(s.totalAmount);
    let prevReturns = new Prisma.Decimal(0);
    for (const r of returnsPrevious) {
      const credit = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      prevReturns = prevReturns.plus(credit);
    }
    const prevNet = prevGross.minus(prevReturns);

    // 2. Payments Received
    let curPayments = new Prisma.Decimal(0);
    for (const p of paymentsCurrent) curPayments = curPayments.plus(p.amount);
    let prevPayments = new Prisma.Decimal(0);
    for (const p of paymentsPrevious) prevPayments = prevPayments.plus(p.amount);

    // 3. Outstanding Receivables (Amount & Count calculated using unified reconciled balance)
    let curReceivables = new Prisma.Decimal(0);
    let curReceivablesCount = 0;
    for (const s of salesCurrent) {
      if (s.status === SaleStatus.CANCELLED) continue;
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
      const effective = Prisma.Decimal.max(new Prisma.Decimal(0), invoiced.sub(returnCredit));
      const netPaid = paid.sub(disbursed).sub(creditDisbursed);
      const owed = effective.sub(netPaid);
      if (owed.gt(0)) {
        curReceivables = curReceivables.add(owed);
        curReceivablesCount++;
      }
    }

    let prevReceivables = new Prisma.Decimal(0);
    for (const s of salesPrevious) {
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
      const effective = Prisma.Decimal.max(new Prisma.Decimal(0), invoiced.sub(returnCredit));
      const netPaid = paid.sub(disbursed).sub(creditDisbursed);
      const owed = effective.sub(netPaid);
      if (owed.gt(0)) prevReceivables = prevReceivables.add(owed);
    }

    // 4. Expenses
    let curExpenses = new Prisma.Decimal(0);
    for (const e of expensesCurrent) curExpenses = curExpenses.plus(e.amount);
    let prevExpenses = new Prisma.Decimal(0);
    for (const e of expensesPrevious) prevExpenses = prevExpenses.plus(e.amount);

    // 5. COGS & Profit
    let curGrossCogs = new Prisma.Decimal(0);
    for (const s of salesCurrent) {
      for (const item of s.items) {
        curGrossCogs = curGrossCogs.plus(new Prisma.Decimal(item.costPriceSnapshot).times(item.quantity));
      }
    }
    let curRestockedReversal = new Prisma.Decimal(0);
    for (const ret of returnsCurrent) {
      if (ret.restocked) {
        for (const retItem of ret.items) {
          const cost = retItem.saleItem ? new Prisma.Decimal(retItem.saleItem.costPriceSnapshot) : new Prisma.Decimal(0);
          curRestockedReversal = curRestockedReversal.plus(cost.times(retItem.quantity));
        }
      }
    }
    const curNetCogs = curGrossCogs.minus(curRestockedReversal);
    const curGrossProfit = curNet.minus(curNetCogs);
    const curNetProfit = curGrossProfit.minus(curExpenses);

    let prevGrossCogs = new Prisma.Decimal(0);
    for (const s of salesPrevious) {
      for (const item of s.items) {
        prevGrossCogs = prevGrossCogs.plus(new Prisma.Decimal(item.costPriceSnapshot).times(item.quantity));
      }
    }
    let prevRestockedReversal = new Prisma.Decimal(0);
    for (const ret of returnsPrevious) {
      if (ret.restocked) {
        for (const retItem of ret.items) {
          const cost = retItem.saleItem ? new Prisma.Decimal(retItem.saleItem.costPriceSnapshot) : new Prisma.Decimal(0);
          prevRestockedReversal = prevRestockedReversal.plus(cost.times(retItem.quantity));
        }
      }
    }
    const prevNetCogs = prevGrossCogs.minus(prevRestockedReversal);
    const prevGrossProfit = prevNet.minus(prevNetCogs);
    const prevNetProfit = prevGrossProfit.minus(prevExpenses);

    // --- VISUALIZATIONS DATA ---
    // A. Sales Trend (group current period by business date)
    const salesTrendMap: Record<string, { date: string; current: number; previous: number }> = {};
    for (const s of salesCurrent) {
      const dateKey = formatToBusinessDate(s.createdAt, tz);
      if (!salesTrendMap[dateKey]) salesTrendMap[dateKey] = { date: dateKey, current: 0, previous: 0 };
      salesTrendMap[dateKey].current += Number(s.totalAmount);
    }
    // Deduct returns on salesTrend
    for (const r of returnsCurrent) {
      const retDate = r.completedAt || r.createdAt;
      const dateKey = formatToBusinessDate(retDate, tz);
      if (salesTrendMap[dateKey]) {
        const credit = Number(r.returnCredit && Number(r.returnCredit) > 0 ? r.returnCredit : r.refundAmount);
        salesTrendMap[dateKey].current = Math.max(0, salesTrendMap[dateKey].current - credit);
      }
    }
    const salesTrend = Object.values(salesTrendMap).sort((a, b) => a.date.localeCompare(b.date));

    // B. Revenue vs Expenses
    const revenueVsExpensesMap: Record<string, { date: string; revenue: number; expenses: number }> = {};
    for (const s of salesCurrent) {
      const dateKey = formatToBusinessDate(s.createdAt, tz);
      if (!revenueVsExpensesMap[dateKey]) revenueVsExpensesMap[dateKey] = { date: dateKey, revenue: 0, expenses: 0 };
      revenueVsExpensesMap[dateKey].revenue += Number(s.totalAmount);
    }
    for (const e of expensesCurrent) {
      const dateKey = formatToBusinessDate(e.date, tz);
      if (!revenueVsExpensesMap[dateKey]) revenueVsExpensesMap[dateKey] = { date: dateKey, revenue: 0, expenses: 0 };
      revenueVsExpensesMap[dateKey].expenses += Number(e.amount);
    }
    const revenueVsExpenses = Object.values(revenueVsExpensesMap).sort((a, b) => a.date.localeCompare(b.date));

    // C. Payment Method Breakdown
    const paymentMethodMap: Record<string, { count: number; totalAmount: Prisma.Decimal }> = {
      [PaymentMethod.CASH]: { count: 0, totalAmount: new Prisma.Decimal(0) },
      [PaymentMethod.TELEBIRR]: { count: 0, totalAmount: new Prisma.Decimal(0) },
      [PaymentMethod.CBE_BIRR]: { count: 0, totalAmount: new Prisma.Decimal(0) },
      [PaymentMethod.BANK_TRANSFER]: { count: 0, totalAmount: new Prisma.Decimal(0) },
      [PaymentMethod.OTHER]: { count: 0, totalAmount: new Prisma.Decimal(0) },
    };
    for (const p of paymentsCurrent) {
      const m = p.method in paymentMethodMap ? p.method : PaymentMethod.OTHER;
      paymentMethodMap[m].count++;
      paymentMethodMap[m].totalAmount = paymentMethodMap[m].totalAmount.plus(p.amount);
    }
    const totalPaymentsVolume = curPayments.toNumber();
    const paymentMethods = Object.entries(paymentMethodMap).map(([method, val]) => ({
      method,
      count: val.count,
      totalAmount: val.totalAmount.toNumber(),
      percentage: totalPaymentsVolume > 0 ? Number(((val.totalAmount.toNumber() / totalPaymentsVolume) * 100).toFixed(1)) : 0,
    }));

    // D. Top-Selling Products
    const productSalesMap: Record<string, { id: string; name: string; sku: string; unitsSold: number; revenue: Prisma.Decimal }> = {};
    for (const s of salesCurrent) {
      for (const item of s.items) {
        if (!productSalesMap[item.productId]) {
          productSalesMap[item.productId] = {
            id: item.productId,
            name: item.product?.name || 'Product',
            sku: item.product?.sku || '',
            unitsSold: 0,
            revenue: new Prisma.Decimal(0),
          };
        }
        productSalesMap[item.productId].unitsSold += Number(item.quantity);
        productSalesMap[item.productId].revenue = productSalesMap[item.productId].revenue.plus(item.lineTotal);
      }
    }
    const topProducts = Object.values(productSalesMap)
      .map((p) => ({ ...p, revenue: p.revenue.toNumber() }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // E. Sales by Category
    const categoryRevenueMap: Record<string, { categoryId: string; name: string; revenue: Prisma.Decimal }> = {};
    for (const cat of categories) {
      categoryRevenueMap[cat.id] = { categoryId: cat.id, name: cat.name, revenue: new Prisma.Decimal(0) };
    }
    categoryRevenueMap['uncategorized'] = { categoryId: 'uncategorized', name: 'Uncategorized', revenue: new Prisma.Decimal(0) };

    for (const s of salesCurrent) {
      for (const item of s.items) {
        const catId = item.product?.categoryId || 'uncategorized';
        if (!categoryRevenueMap[catId]) {
          categoryRevenueMap[catId] = { categoryId: catId, name: 'Uncategorized', revenue: new Prisma.Decimal(0) };
        }
        categoryRevenueMap[catId].revenue = categoryRevenueMap[catId].revenue.plus(item.lineTotal);
      }
    }
    const curNetNum = curNet.toNumber();
    const salesByCategory = Object.values(categoryRevenueMap)
      .filter((c) => c.revenue.gt(0))
      .map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        revenue: c.revenue.toNumber(),
        percentage: curNetNum > 0 ? Number(((c.revenue.toNumber() / curNetNum) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Operational alerts object
    const alerts = {
      lowStockProducts: lowStockAlertList,
      lowStockCount: lowStockAlertList.length,
      outOfStockProducts: outOfStockAlertList,
      outOfStockCount: outOfStockAlertList.length,
      approachingStockout: approachingThresholdAlertList,
      approachingStockoutCount: approachingThresholdAlertList.length,
      pendingPurchaseOrders: pendingPurchases.map((po) => ({
        id: po.id,
        orderNumber: po.orderNumber,
        supplierName: po.supplier.name,
        status: po.status,
        totalAmount: Number(po.totalAmount),
        createdAt: po.createdAt,
      })),
      pendingPurchaseOrdersCount: pendingPurchases.length,
      unresolvedReturns: pendingReturns.map((pr) => ({
        id: pr.id,
        returnNumber: pr.returnNumber,
        receiptNumber: pr.sale?.receiptNumber,
        refundAmount: Number(pr.refundAmount),
        status: pr.status,
        createdAt: pr.createdAt,
      })),
      unresolvedReturnsCount: pendingReturns.length,
      outstandingReceivablesCount: curReceivablesCount,
      outstandingReceivablesAmount: curReceivables.toNumber(),
    };

    // Construct 8 KPI comparisons
    const kpiComparisons = {
      grossSales: {
        ...calculateComparison(curGross.toNumber(), prevGross.toNumber()),
        explanation: 'Total invoiced sales revenue before returns and discounts in Ethiopian Birr (ETB).',
      },
      netSales: {
        ...calculateComparison(curNet.toNumber(), prevNet.toNumber()),
        explanation: 'Gross sales revenue less customer return credits and allowances in ETB.',
      },
      totalPaymentsReceived: {
        ...calculateComparison(curPayments.toNumber(), prevPayments.toNumber()),
        explanation: 'Actual funds collected from customers across cash and digital channels in ETB.',
      },
      outstandingReceivables: {
        ...calculateComparison(curReceivables.toNumber(), prevReceivables.toNumber()),
        explanation: 'Uncollected balance owed by customers on invoices created in this period.',
      },
      costOfGoodsSold: role === AppRole.OWNER ? {
        ...calculateComparison(curNetCogs.toNumber(), prevNetCogs.toNumber()),
        explanation: 'Wholesale acquisition cost of merchandise sold, adjusted for restocked returns.',
      } : null,
      grossProfit: role === AppRole.OWNER ? {
        ...calculateComparison(curGrossProfit.toNumber(), prevGrossProfit.toNumber()),
        explanation: 'Net sales minus Cost of Goods Sold. Represents core trading profit.',
      } : null,
      totalExpenses: {
        ...calculateComparison(curExpenses.toNumber(), prevExpenses.toNumber()),
        explanation: 'Total operational overhead (rent, utilities, payroll, etc.) recorded.',
      },
      netOperatingProfit: role === AppRole.OWNER ? {
        ...calculateComparison(curNetProfit.toNumber(), prevNetProfit.toNumber()),
        explanation: 'Gross profit minus operating expenses. Net commercial earnings in ETB.',
      } : null,
    };

    // Owner gets full financial metrics (COGS, Gross Profit, Net Margin, Valuation)
    if (role === AppRole.OWNER) {
      let grossCogsMonth = new Prisma.Decimal(0);
      for (const sale of salesMonth) {
        for (const item of sale.items) {
          grossCogsMonth = grossCogsMonth.plus(new Prisma.Decimal(item.costPriceSnapshot).times(item.quantity));
        }
      }
      let restockedCogsReversalMonth = new Prisma.Decimal(0);
      for (const ret of returnsMonth) {
        if (ret.restocked) {
          for (const retItem of ret.items) {
            const unitCost = retItem.saleItem ? new Prisma.Decimal(retItem.saleItem.costPriceSnapshot) : new Prisma.Decimal(0);
            restockedCogsReversalMonth = restockedCogsReversalMonth.plus(unitCost.times(retItem.quantity));
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
        netCustomerCashMovementToday: netCashMovementToday.toNumber(),
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
        netCustomerCashMovementMonth: netCashMovementMonth.toNumber(),
        outstandingCustomerBalancesMonth: outstandingCustomerBalancesMonth.toNumber(),
        customerCreditsPayableMonth: customerCreditsPayableMonth.toNumber(),

        // Tax & VAT Adjustments
        grossTaxMonth: grossTaxMonth.toNumber(),
        refundedTaxMonth: refundedTaxMonth.toNumber(),
        netTaxMonth: netTaxMonth.toNumber(),
        netOutputVatAfterRefunds: netTaxMonth.toNumber(),
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
        outOfStockCount,
        totalProducts: products.length,
        inventoryValuation: inventoryValuation.toNumber(),

        // Phase 4 Enhanced Dashboard additions
        periodPreset: preset,
        periodLabel,
        comparison: kpiComparisons,
        visualizations: {
          salesTrend,
          revenueVsExpenses,
          paymentMethods,
          topProducts,
          salesByCategory,
        },
        alerts,
      };

      return {
        ...ownerData,
        kpi: ownerData,
      };
    }

    // Manager gets operational metrics (Wholesale COGS and Net Profit are masked)
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
      netCustomerCashMovementToday: netCashMovementToday.toNumber(),
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
      netCustomerCashMovementMonth: netCashMovementMonth.toNumber(),
      outstandingCustomerBalancesMonth: outstandingCustomerBalancesMonth.toNumber(),
      customerCreditsPayableMonth: customerCreditsPayableMonth.toNumber(),

      // Tax & VAT Adjustments
      grossTaxMonth: grossTaxMonth.toNumber(),
      refundedTaxMonth: refundedTaxMonth.toNumber(),
      netTaxMonth: netTaxMonth.toNumber(),
      netOutputVatAfterRefunds: netTaxMonth.toNumber(),
      vatAdjustmentMonth: refundedTaxMonth.toNumber(),

      expensesMonth: totalExpensesMonth.toNumber(),
      lowStockCount,
      outOfStockCount,
      totalProducts: products.length,

      // Phase 4 Enhanced Dashboard additions
      periodPreset: preset,
      periodLabel,
      comparison: kpiComparisons,
      visualizations: {
        salesTrend,
        revenueVsExpenses,
        paymentMethods,
        topProducts,
        salesByCategory,
      },
      alerts,
    };

    return {
      ...managerData,
      kpi: managerData,
    };
  }

  // =========================================================================
  // 2. CASHIER SHIFT SUMMARY
  // =========================================================================
  async getCashierSummary(organizationId: string, cashierUserId: string) {
    const tz = await this.getOrgTimezone(organizationId);
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
          OR: [{ cashierUserId }, { sale: { cashierUserId } }],
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
    for (const s of ownSalesToday) grossAmountToday = grossAmountToday.plus(s.totalAmount);

    let refundsAmountToday = new Prisma.Decimal(0);
    for (const r of ownReturnsToday) {
      const creditAmt = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      refundsAmountToday = refundsAmountToday.plus(creditAmt);
    }

    const netAmountToday = grossAmountToday.minus(refundsAmountToday);

    let customerPaymentsReceivedToday = new Prisma.Decimal(0);
    let cashReceivedToday = new Prisma.Decimal(0);
    for (const s of ownSalesToday) {
      for (const p of s.payments) {
        const pAmt = new Prisma.Decimal(p.amount);
        customerPaymentsReceivedToday = customerPaymentsReceivedToday.plus(pAmt);
        if (p.method === PaymentMethod.CASH) cashReceivedToday = cashReceivedToday.plus(pAmt);
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
      if (r.refundMethod === PaymentMethod.CASH) cashRefundsToday = cashRefundsToday.plus(totalPayout);
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

      customerPaymentsReceivedToday: customerPaymentsReceivedToday.toNumber(),
      refundsDisbursedToday: refundsDisbursedToday.toNumber(),
      refundsActuallyDisbursedToday: refundsDisbursedToday.toNumber(),
      netCustomerPaymentMovementToday: netCustomerPaymentMovementToday.toNumber(),
      cashReceivedToday: cashReceivedToday.toNumber(),
      cashRefundsToday: cashRefundsToday.toNumber(),
      netCashMovementToday: netCashMovementToday.toNumber(),
      netCustomerCashMovementToday: netCashMovementToday.toNumber(),

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

  // =========================================================================
  // 3. INVENTORY SUMMARY & LEDGER
  // =========================================================================
  async getInventorySummary(organizationId: string, query?: ReportQueryDto) {
    const products = await this.prisma.product.findMany({
      where: { organizationId, isArchived: false },
      include: {
        category: { select: { id: true, name: true } },
        inventory: true,
      },
    });

    const lowStockItems: any[] = [];
    let totalValuation = new Prisma.Decimal(0);
    let totalRetailValuation = new Prisma.Decimal(0);
    let totalStockOnHand = new Prisma.Decimal(0);

    for (const p of products) {
      const onHand = Number(p.inventory?.quantityOnHand || 0);
      const threshold = Number(p.minStockThreshold);
      const stockDecimal = new Prisma.Decimal(onHand);

      totalStockOnHand = totalStockOnHand.plus(stockDecimal);
      totalValuation = totalValuation.plus(stockDecimal.times(p.costPrice));
      totalRetailValuation = totalRetailValuation.plus(stockDecimal.times(p.sellingPrice));

      if (onHand <= threshold) {
        lowStockItems.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category?.name,
          quantityOnHand: onHand,
          minStockThreshold: threshold,
          costPrice: Number(p.costPrice),
          sellingPrice: Number(p.sellingPrice),
        });
      }
    }

    const recentMovements = await this.prisma.inventoryMovement.findMany({
      where: { organizationId },
      include: {
        product: { select: { name: true, sku: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      role: 'inventory_staff',
      totalProducts: products.length,
      totalStockOnHand: totalStockOnHand.toNumber(),
      lowStockCount: lowStockItems.length,
      outOfStockCount: lowStockItems.filter((i) => i.quantityOnHand === 0).length,
      inventoryValuation: totalValuation.toNumber(),
      totalRetailValuation: totalRetailValuation.toNumber(),
      potentialProfit: totalRetailValuation.minus(totalValuation).toNumber(),
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

  // =========================================================================
  // 4. DAILY SALES CHART
  // =========================================================================
  async getDailySalesChart(organizationId: string) {
    const tz = await this.getOrgTimezone(organizationId);
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
            { createdAt: { gte: sevenDaysAgoStart } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: {
          sale: { organizationId, status: { not: SaleStatus.CANCELLED } },
          createdAt: { gte: sevenDaysAgoStart },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

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
      const returnDate = (r.createdAt && daysMap[formatToBusinessDate(r.createdAt, tz)]) ? r.createdAt : (r.completedAt || r.createdAt);
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

  // =========================================================================
  // 5. SALES REPORTS: SUMMARY & BREAKDOWNS
  // =========================================================================
  async getSalesSummary(organizationId: string, userRole: string, query: ReportQueryDto) {
    const role = normalizeRole(userRole);
    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd, label } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    // Build filter conditions
    const whereSale: Prisma.SaleWhereInput = {
      organizationId,
      createdAt: { gte: currentStart, lt: currentEnd },
    };
    if (query.saleStatus) {
      whereSale.status = query.saleStatus;
    } else {
      whereSale.status = { not: SaleStatus.CANCELLED };
    }
    if (query.cashierId) {
      whereSale.cashierUserId = query.cashierId;
    }
    if (query.paymentMethod) {
      whereSale.payments = { some: { method: query.paymentMethod } };
    }
    if (query.categoryId || query.productId) {
      whereSale.items = {
        some: {
          ...(query.productId ? { productId: query.productId } : {}),
          ...(query.categoryId ? { product: { categoryId: query.categoryId } } : {}),
        },
      };
    }

    // Query sales and completed returns
    const [sales, returns] = await Promise.all([
      this.prisma.sale.findMany({
        where: whereSale,
        include: {
          cashier: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: { include: { category: true } },
            },
          },
          payments: true,
          returns: { where: { status: ReturnStatus.COMPLETED } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: currentStart, lt: currentEnd } },
            { completedAt: null, createdAt: { gte: currentStart, lt: currentEnd } },
          ],
        },
        include: {
          items: { include: { saleItem: true } },
        },
      }),
    ]);

    // Financial calculations
    let grossSales = new Prisma.Decimal(0);
    let totalDiscounts = new Prisma.Decimal(0);
    let totalItemsSold = new Prisma.Decimal(0);
    let grossCogs = new Prisma.Decimal(0);
    let fullyReturnedCount = 0;
    let partiallyReturnedCount = 0;

    for (const s of sales) {
      grossSales = grossSales.plus(s.totalAmount);
      totalDiscounts = totalDiscounts.plus(s.discountAmount);

      if (s.status === SaleStatus.REFUNDED) {
        fullyReturnedCount++;
      } else if (s.returns.length > 0) {
        partiallyReturnedCount++;
      }

      for (const item of s.items) {
        totalItemsSold = totalItemsSold.plus(item.quantity);
        if (role === AppRole.OWNER) {
          grossCogs = grossCogs.plus(new Prisma.Decimal(item.costPriceSnapshot).times(item.quantity));
        }
      }
    }

    let returnCredits = new Prisma.Decimal(0);
    let restockedCogsReversal = new Prisma.Decimal(0);
    for (const r of returns) {
      const credit = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      returnCredits = returnCredits.plus(credit);

      if (role === AppRole.OWNER && r.restocked) {
        for (const item of r.items) {
          const cost = item.saleItem ? new Prisma.Decimal(item.saleItem.costPriceSnapshot) : new Prisma.Decimal(0);
          restockedCogsReversal = restockedCogsReversal.plus(cost.times(item.quantity));
        }
      }
    }

    const netSales = grossSales.minus(returnCredits);
    const netCogs = grossCogs.minus(restockedCogsReversal);
    const grossProfit = netSales.minus(netCogs);
    const grossMargin = netSales.gt(0) ? Number(grossProfit.div(netSales).times(100).toFixed(1)) : 0;
    const avgTransactionValue = sales.length > 0 ? Number(netSales.div(sales.length).toFixed(2)) : 0;

    // --- BREAKDOWNS ---
    // 1. By Date
    const byDateMap: Record<string, { date: string; gross: Prisma.Decimal; refunds: Prisma.Decimal; transactions: number }> = {};
    for (const s of sales) {
      const d = formatToBusinessDate(s.createdAt, tz);
      if (!byDateMap[d]) byDateMap[d] = { date: d, gross: new Prisma.Decimal(0), refunds: new Prisma.Decimal(0), transactions: 0 };
      byDateMap[d].gross = byDateMap[d].gross.plus(s.totalAmount);
      byDateMap[d].transactions++;
    }
    for (const r of returns) {
      const d = formatToBusinessDate(r.completedAt || r.createdAt, tz);
      if (byDateMap[d]) {
        const credit = r.returnCredit && Number(r.returnCredit) > 0 ? r.returnCredit : r.refundAmount;
        byDateMap[d].refunds = byDateMap[d].refunds.plus(new Prisma.Decimal(credit));
      }
    }
    const byDate = Object.values(byDateMap)
      .map((entry) => ({
        date: entry.date,
        gross: entry.gross.toNumber(),
        refunds: entry.refunds.toNumber(),
        net: entry.gross.minus(entry.refunds).toNumber(),
        transactions: entry.transactions,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 2. By Product
    const byProductMap: Record<string, { id: string; name: string; sku: string; category: string; unitsSold: number; revenue: Prisma.Decimal }> = {};
    for (const s of sales) {
      for (const item of s.items) {
        if (!byProductMap[item.productId]) {
          byProductMap[item.productId] = {
            id: item.productId,
            name: item.product?.name || 'Unknown',
            sku: item.product?.sku || '',
            category: item.product?.category?.name || 'General',
            unitsSold: 0,
            revenue: new Prisma.Decimal(0),
          };
        }
        byProductMap[item.productId].unitsSold += Number(item.quantity);
        byProductMap[item.productId].revenue = byProductMap[item.productId].revenue.plus(item.lineTotal);
      }
    }
    const byProduct = Object.values(byProductMap)
      .map((p) => ({ ...p, revenue: p.revenue.toNumber() }))
      .sort((a, b) => b.revenue - a.revenue);

    // 3. By Category
    const byCategoryMap: Record<string, { categoryId: string; name: string; unitsSold: number; revenue: Prisma.Decimal }> = {};
    for (const s of sales) {
      for (const item of s.items) {
        const catId = item.product?.categoryId || 'uncategorized';
        const catName = item.product?.category?.name || 'Uncategorized';
        if (!byCategoryMap[catId]) {
          byCategoryMap[catId] = { categoryId: catId, name: catName, unitsSold: 0, revenue: new Prisma.Decimal(0) };
        }
        byCategoryMap[catId].unitsSold += Number(item.quantity);
        byCategoryMap[catId].revenue = byCategoryMap[catId].revenue.plus(item.lineTotal);
      }
    }
    const byCategory = Object.values(byCategoryMap)
      .map((c) => ({ ...c, revenue: c.revenue.toNumber() }))
      .sort((a, b) => b.revenue - a.revenue);

    // 4. By Cashier
    const byCashierMap: Record<string, { cashierId: string; name: string; email: string; transactions: number; revenue: Prisma.Decimal }> = {};
    for (const s of sales) {
      const cId = s.cashierUserId;
      if (!byCashierMap[cId]) {
        byCashierMap[cId] = {
          cashierId: cId,
          name: s.cashier?.name || 'Staff',
          email: s.cashier?.email || '',
          transactions: 0,
          revenue: new Prisma.Decimal(0),
        };
      }
      byCashierMap[cId].transactions++;
      byCashierMap[cId].revenue = byCashierMap[cId].revenue.plus(s.totalAmount);
    }
    const byCashier = Object.values(byCashierMap)
      .map((c) => ({
        ...c,
        revenue: c.revenue.toNumber(),
        avgTicket: c.transactions > 0 ? Number(c.revenue.div(c.transactions).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 5. By Payment Method
    const byPaymentMethodMap: Record<string, { count: number; totalAmount: Prisma.Decimal }> = {};
    for (const s of sales) {
      for (const p of s.payments) {
        if (!byPaymentMethodMap[p.method]) {
          byPaymentMethodMap[p.method] = { count: 0, totalAmount: new Prisma.Decimal(0) };
        }
        byPaymentMethodMap[p.method].count++;
        byPaymentMethodMap[p.method].totalAmount = byPaymentMethodMap[p.method].totalAmount.plus(p.amount);
      }
    }
    const byPaymentMethod = Object.entries(byPaymentMethodMap).map(([method, data]) => ({
      method,
      count: data.count,
      totalAmount: data.totalAmount.toNumber(),
    }));

    // 6. By Sale Status
    const bySaleStatusMap: Record<string, { count: number; totalAmount: Prisma.Decimal }> = {};
    for (const s of sales) {
      if (!bySaleStatusMap[s.status]) {
        bySaleStatusMap[s.status] = { count: 0, totalAmount: new Prisma.Decimal(0) };
      }
      bySaleStatusMap[s.status].count++;
      bySaleStatusMap[s.status].totalAmount = bySaleStatusMap[s.status].totalAmount.plus(s.totalAmount);
    }
    const bySaleStatus = Object.entries(bySaleStatusMap).map(([status, data]) => ({
      status,
      count: data.count,
      totalAmount: data.totalAmount.toNumber(),
    }));

    return {
      periodLabel: label,
      startDate: currentStart.toISOString(),
      endDate: currentEnd.toISOString(),
      grossSales: grossSales.toNumber(),
      totalDiscounts: totalDiscounts.toNumber(),
      returnCredits: returnCredits.toNumber(),
      netSales: netSales.toNumber(),
      cogs: role === AppRole.OWNER ? netCogs.toNumber() : null,
      grossProfit: role === AppRole.OWNER ? grossProfit.toNumber() : null,
      grossMargin: role === AppRole.OWNER ? grossMargin : null,
      averageTransactionValue: avgTransactionValue,
      totalItemsSold: totalItemsSold.toNumber(),
      totalTransactions: sales.length,
      fullyReturnedCount,
      partiallyReturnedCount,
      byDate,
      byProduct,
      byCategory,
      byCashier,
      byPaymentMethod,
      bySaleStatus,
    };
  }

  // =========================================================================
  // 6. DETAILED SALES TABLE (PAGINATED)
  // =========================================================================
  async getSalesDetails(organizationId: string, userRole: string, query: ReportQueryDto) {
    const role = normalizeRole(userRole);
    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const whereSale: Prisma.SaleWhereInput = {
      organizationId,
      createdAt: { gte: currentStart, lt: currentEnd },
    };

    if (query.saleStatus) whereSale.status = query.saleStatus;
    if (query.cashierId) whereSale.cashierUserId = query.cashierId;
    if (query.paymentMethod) whereSale.payments = { some: { method: query.paymentMethod } };
    if (query.search) {
      whereSale.OR = [
        { receiptNumber: { contains: query.search, mode: 'insensitive' } },
        { cashier: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.categoryId || query.productId) {
      whereSale.items = {
        some: {
          ...(query.productId ? { productId: query.productId } : {}),
          ...(query.categoryId ? { product: { categoryId: query.categoryId } } : {}),
        },
      };
    }

    const [total, sales] = await Promise.all([
      this.prisma.sale.count({ where: whereSale }),
      this.prisma.sale.findMany({
        where: whereSale,
        include: {
          cashier: { select: { id: true, name: true, email: true } },
          items: true,
          payments: true,
          returns: { where: { status: ReturnStatus.COMPLETED } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const items = sales.map((s) => {
      const gross = Number(s.totalAmount);
      const paid = s.payments.reduce((acc, p) => acc + Number(p.amount), 0);
      const returnCredit = s.returns.reduce(
        (acc, r) => acc + Number(r.returnCredit && Number(r.returnCredit) > 0 ? r.returnCredit : r.refundAmount),
        0,
      );
      const refundDisbursed = s.returns.reduce(
        (acc, r) => acc + Number(r.refundDisbursed || r.refundAmount),
        0,
      );
      const netAmount = Math.max(0, gross - returnCredit);

      let paymentStatus = 'PAID';
      if (paid < gross && paid > 0) paymentStatus = 'PARTIAL';
      if (paid === 0) paymentStatus = 'UNPAID';

      let totalCost: number | null = null;
      let profit: number | null = null;
      if (role === AppRole.OWNER) {
        totalCost = s.items.reduce((acc, item) => acc + Number(item.costPriceSnapshot) * Number(item.quantity), 0);
        profit = netAmount - totalCost;
      }

      return {
        id: s.id,
        receiptNumber: s.receiptNumber,
        createdAt: s.createdAt,
        cashierId: s.cashierUserId,
        cashierName: s.cashier?.name || 'Staff',
        itemsCount: s.items.length,
        subtotal: Number(s.subtotal),
        discountAmount: Number(s.discountAmount),
        taxAmount: Number(s.taxAmount),
        totalAmount: gross,
        returnCredit,
        refundDisbursed,
        netAmount,
        paymentMethods: s.payments.map((p) => p.method),
        paymentStatus,
        status: s.status,
        costAmount: totalCost,
        profitAmount: profit,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================================================================
  // 7. FINANCIAL REPORT: PROFIT & LOSS STATEMENT
  // =========================================================================
  async getProfitAndLossReport(organizationId: string, userRole: string, query: ReportQueryDto) {
    const role = normalizeRole(userRole);
    if (role !== AppRole.OWNER) {
      throw new ForbiddenException('Access denied: Profit & Loss statements are restricted to business owners.');
    }

    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd, label } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const [sales, returns, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: currentStart, lt: currentEnd },
          status: { not: SaleStatus.CANCELLED },
        },
        include: { items: true },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: currentStart, lt: currentEnd } },
            { completedAt: null, createdAt: { gte: currentStart, lt: currentEnd } },
          ],
        },
        include: { items: { include: { saleItem: true } } },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          date: { gte: currentStart, lt: currentEnd },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    // 1. Revenue
    let grossSales = new Prisma.Decimal(0);
    let discounts = new Prisma.Decimal(0);
    let grossCogs = new Prisma.Decimal(0);
    for (const s of sales) {
      grossSales = grossSales.plus(s.totalAmount);
      discounts = discounts.plus(s.discountAmount);
      for (const item of s.items) {
        grossCogs = grossCogs.plus(new Prisma.Decimal(item.costPriceSnapshot).times(item.quantity));
      }
    }

    let returnCredits = new Prisma.Decimal(0);
    let restockedCogsReversal = new Prisma.Decimal(0);
    for (const r of returns) {
      const credit = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
        ? new Prisma.Decimal(r.returnCredit)
        : new Prisma.Decimal(r.refundAmount);
      returnCredits = returnCredits.plus(credit);

      if (r.restocked) {
        for (const item of r.items) {
          const cost = item.saleItem ? new Prisma.Decimal(item.saleItem.costPriceSnapshot) : new Prisma.Decimal(0);
          restockedCogsReversal = restockedCogsReversal.plus(cost.times(item.quantity));
        }
      }
    }

    const netSales = grossSales.minus(returnCredits);
    const netCogs = grossCogs.minus(restockedCogsReversal);
    const grossProfit = netSales.minus(netCogs);
    const grossMargin = netSales.gt(0) ? Number(grossProfit.div(netSales).times(100).toFixed(1)) : 0;

    // 2. Operating Expenses Breakdown
    const expenseCategoryMap: Record<string, Prisma.Decimal> = {};
    let totalExpenses = new Prisma.Decimal(0);
    for (const e of expenses) {
      const cat = e.category || 'General';
      if (!expenseCategoryMap[cat]) expenseCategoryMap[cat] = new Prisma.Decimal(0);
      expenseCategoryMap[cat] = expenseCategoryMap[cat].plus(e.amount);
      totalExpenses = totalExpenses.plus(e.amount);
    }

    const operatingExpenses = Object.entries(expenseCategoryMap).map(([category, amount]) => ({
      category,
      amount: amount.toNumber(),
      percentage: totalExpenses.gt(0) ? Number(amount.div(totalExpenses).times(100).toFixed(1)) : 0,
    }));

    const netOperatingProfit = grossProfit.minus(totalExpenses);
    const netMargin = netSales.gt(0) ? Number(netOperatingProfit.div(netSales).times(100).toFixed(1)) : 0;

    return {
      periodLabel: label,
      startDate: currentStart.toISOString(),
      endDate: currentEnd.toISOString(),
      currency: 'ETB',
      revenue: {
        grossSales: grossSales.toNumber(),
        discounts: discounts.toNumber(),
        returnCredits: returnCredits.toNumber(),
        netSales: netSales.toNumber(),
      },
      costOfGoodsSold: {
        grossCost: grossCogs.toNumber(),
        restockedReturnCostReversal: restockedCogsReversal.toNumber(),
        netCostOfGoodsSold: netCogs.toNumber(),
      },
      grossProfit: grossProfit.toNumber(),
      grossMarginPercentage: grossMargin,
      operatingExpenses: {
        items: operatingExpenses,
        totalExpenses: totalExpenses.toNumber(),
      },
      netOperatingProfit: netOperatingProfit.toNumber(),
      netMarginPercentage: netMargin,
    };
  }

  // =========================================================================
  // 8. FINANCIAL REPORT: CASH FLOW STATEMENT
  // =========================================================================
  async getCashFlowReport(organizationId: string, userRole: string, query: ReportQueryDto) {
    const role = normalizeRole(userRole);
    if (role !== AppRole.OWNER) {
      throw new ForbiddenException('Access denied: Cash Flow statements are restricted to business owners.');
    }

    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd, label } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const [payments, returns, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          sale: { organizationId, status: { not: SaleStatus.CANCELLED } },
          createdAt: { gte: currentStart, lt: currentEnd },
        },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: currentStart, lt: currentEnd } },
            { completedAt: null, createdAt: { gte: currentStart, lt: currentEnd } },
          ],
        },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          date: { gte: currentStart, lt: currentEnd },
        },
      }),
    ]);

    // 1. Inflows
    const inflowsMap: Record<PaymentMethod, Prisma.Decimal> = {
      [PaymentMethod.CASH]: new Prisma.Decimal(0),
      [PaymentMethod.TELEBIRR]: new Prisma.Decimal(0),
      [PaymentMethod.CBE_BIRR]: new Prisma.Decimal(0),
      [PaymentMethod.BANK_TRANSFER]: new Prisma.Decimal(0),
      [PaymentMethod.OTHER]: new Prisma.Decimal(0),
    };
    let totalInflows = new Prisma.Decimal(0);
    for (const p of payments) {
      inflowsMap[p.method] = inflowsMap[p.method].plus(p.amount);
      totalInflows = totalInflows.plus(p.amount);
    }

    // 2. Outflows (Refunds & Expenses)
    const refundsOutflowMap: Record<PaymentMethod, Prisma.Decimal> = {
      [PaymentMethod.CASH]: new Prisma.Decimal(0),
      [PaymentMethod.TELEBIRR]: new Prisma.Decimal(0),
      [PaymentMethod.CBE_BIRR]: new Prisma.Decimal(0),
      [PaymentMethod.BANK_TRANSFER]: new Prisma.Decimal(0),
      [PaymentMethod.OTHER]: new Prisma.Decimal(0),
    };
    let totalRefundsDisbursed = new Prisma.Decimal(0);
    let totalCustomerCreditDisbursed = new Prisma.Decimal(0);

    for (const r of returns) {
      const disbursed = new Prisma.Decimal(r.refundDisbursed || r.refundAmount);
      const creditDisbursed = new Prisma.Decimal(r.customerCreditDisbursed || 0);
      const totalPayout = disbursed.plus(creditDisbursed);
      refundsOutflowMap[r.refundMethod] = refundsOutflowMap[r.refundMethod].plus(totalPayout);
      totalRefundsDisbursed = totalRefundsDisbursed.plus(disbursed);
      totalCustomerCreditDisbursed = totalCustomerCreditDisbursed.plus(creditDisbursed);
    }

    const expensesOutflowMap: Record<PaymentMethod, Prisma.Decimal> = {
      [PaymentMethod.CASH]: new Prisma.Decimal(0),
      [PaymentMethod.TELEBIRR]: new Prisma.Decimal(0),
      [PaymentMethod.CBE_BIRR]: new Prisma.Decimal(0),
      [PaymentMethod.BANK_TRANSFER]: new Prisma.Decimal(0),
      [PaymentMethod.OTHER]: new Prisma.Decimal(0),
    };
    let totalExpensesOutflow = new Prisma.Decimal(0);
    for (const e of expenses) {
      expensesOutflowMap[e.paymentMethod] = expensesOutflowMap[e.paymentMethod].plus(e.amount);
      totalExpensesOutflow = totalExpensesOutflow.plus(e.amount);
    }

    const totalOutflows = totalRefundsDisbursed.plus(totalCustomerCreditDisbursed).plus(totalExpensesOutflow);
    const netCashFlow = totalInflows.minus(totalOutflows);

    // Physical Cash net movement
    const cashInflows = inflowsMap[PaymentMethod.CASH];
    const cashOutflows = refundsOutflowMap[PaymentMethod.CASH].plus(expensesOutflowMap[PaymentMethod.CASH]);
    const netPhysicalCashMovement = cashInflows.minus(cashOutflows);

    return {
      periodLabel: label,
      startDate: currentStart.toISOString(),
      endDate: currentEnd.toISOString(),
      currency: 'ETB',
      inflows: {
        byMethod: {
          cash: inflowsMap[PaymentMethod.CASH].toNumber(),
          telebirr: inflowsMap[PaymentMethod.TELEBIRR].toNumber(),
          cbeBirr: inflowsMap[PaymentMethod.CBE_BIRR].toNumber(),
          bankTransfer: inflowsMap[PaymentMethod.BANK_TRANSFER].toNumber(),
          other: inflowsMap[PaymentMethod.OTHER].toNumber(),
        },
        totalInflows: totalInflows.toNumber(),
      },
      outflows: {
        refundsDisbursed: totalRefundsDisbursed.toNumber(),
        customerCreditDisbursed: totalCustomerCreditDisbursed.toNumber(),
        operatingExpenses: totalExpensesOutflow.toNumber(),
        totalOutflows: totalOutflows.toNumber(),
        byMethod: {
          cash: refundsOutflowMap[PaymentMethod.CASH].plus(expensesOutflowMap[PaymentMethod.CASH]).toNumber(),
          telebirr: refundsOutflowMap[PaymentMethod.TELEBIRR].plus(expensesOutflowMap[PaymentMethod.TELEBIRR]).toNumber(),
          cbeBirr: refundsOutflowMap[PaymentMethod.CBE_BIRR].plus(expensesOutflowMap[PaymentMethod.CBE_BIRR]).toNumber(),
          bankTransfer: refundsOutflowMap[PaymentMethod.BANK_TRANSFER].plus(expensesOutflowMap[PaymentMethod.BANK_TRANSFER]).toNumber(),
          other: refundsOutflowMap[PaymentMethod.OTHER].plus(expensesOutflowMap[PaymentMethod.OTHER]).toNumber(),
        },
      },
      netCashFlow: netCashFlow.toNumber(),
      netPhysicalCashMovement: netPhysicalCashMovement.toNumber(),
    };
  }

  // =========================================================================
  // 9. FINANCIAL REPORT: RECEIVABLES & UNPAID BALANCES
  // =========================================================================
  async getReceivablesReport(organizationId: string, userRole: string, query: ReportQueryDto) {
    const role = normalizeRole(userRole);
    if (role !== AppRole.OWNER) {
      throw new ForbiddenException('Access denied: Receivables reports are restricted to business owners.');
    }

    const sales = await this.prisma.sale.findMany({
      where: {
        organizationId,
        status: { not: SaleStatus.CANCELLED },
      },
      select: {
        id: true,
        receiptNumber: true,
        createdAt: true,
        totalAmount: true,
        status: true,
        cashier: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
        returns: {
          where: { status: ReturnStatus.COMPLETED },
          select: {
            returnCredit: true,
            refundAmount: true,
            refundDisbursed: true,
            customerCreditDisbursed: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalReceivables = new Prisma.Decimal(0);
    let totalCustomerCreditLiabilities = new Prisma.Decimal(0);
    const receivableItems: any[] = [];
    const now = new Date();

    for (const s of sales) {
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
      const balanceDue = effectiveInvoice.sub(netPaid);

      if (balanceDue.gt(0)) {
        totalReceivables = totalReceivables.add(balanceDue);
        const daysOutstanding = Math.floor((now.getTime() - new Date(s.createdAt).getTime()) / (24 * 60 * 60 * 1000));
        receivableItems.push({
          id: s.id,
          receiptNumber: s.receiptNumber,
          createdAt: s.createdAt,
          cashierName: s.cashier?.name || 'Staff',
          totalAmount: invoiced.toNumber(),
          paidAmount: paid.toNumber(),
          returnCredit: returnCredit.toNumber(),
          refundDisbursed: disbursed.toNumber(),
          balanceDue: balanceDue.toNumber(),
          daysOutstanding,
          status: s.status,
        });
      } else if (balanceDue.lt(0)) {
        totalCustomerCreditLiabilities = totalCustomerCreditLiabilities.add(balanceDue.abs());
      }
    }

    // Aging analysis
    const aging = {
      under30Days: receivableItems.filter((i) => i.daysOutstanding <= 30).reduce((a, b) => a + b.balanceDue, 0),
      days31to60: receivableItems.filter((i) => i.daysOutstanding > 30 && i.daysOutstanding <= 60).reduce((a, b) => a + b.balanceDue, 0),
      days61to90: receivableItems.filter((i) => i.daysOutstanding > 60 && i.daysOutstanding <= 90).reduce((a, b) => a + b.balanceDue, 0),
      over90Days: receivableItems.filter((i) => i.daysOutstanding > 90).reduce((a, b) => a + b.balanceDue, 0),
    };

    return {
      totalReceivables: totalReceivables.toNumber(),
      totalCustomerCreditLiabilities: totalCustomerCreditLiabilities.toNumber(),
      receivableCount: receivableItems.length,
      aging,
      receivables: receivableItems,
    };
  }

  // =========================================================================
  // 10. FINANCIAL REPORT: TAX SUMMARY
  // =========================================================================
  async getTaxSummaryReport(organizationId: string, userRole: string, query: ReportQueryDto) {
    const role = normalizeRole(userRole);
    if (role !== AppRole.OWNER) {
      throw new ForbiddenException('Access denied: Tax reports are restricted to business owners.');
    }

    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd, label } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { taxRate: true, taxInclusive: true },
    });

    const [sales, returns] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: currentStart, lt: currentEnd },
          status: { not: SaleStatus.CANCELLED },
        },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: currentStart, lt: currentEnd } },
            { completedAt: null, createdAt: { gte: currentStart, lt: currentEnd } },
          ],
        },
        include: { sale: { select: { totalAmount: true, taxAmount: true } } },
      }),
    ]);

    let totalGrossSales = new Prisma.Decimal(0);
    let grossOutputVat = new Prisma.Decimal(0);
    for (const s of sales) {
      totalGrossSales = totalGrossSales.plus(s.totalAmount);
      grossOutputVat = grossOutputVat.plus(s.taxAmount);
    }

    let refundedOutputVat = new Prisma.Decimal(0);
    for (const r of returns) {
      if (r.sale && new Prisma.Decimal(r.sale.totalAmount).gt(0)) {
        const ratio = new Prisma.Decimal(r.sale.taxAmount).div(new Prisma.Decimal(r.sale.totalAmount));
        const credit = (r.returnCredit !== null && r.returnCredit !== undefined)
          ? new Prisma.Decimal(r.returnCredit)
          : new Prisma.Decimal(r.refundAmount);
        refundedOutputVat = refundedOutputVat.plus(credit.mul(ratio));
      }
    }
    refundedOutputVat = refundedOutputVat.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const netOutputVat = grossOutputVat.minus(refundedOutputVat);

    return {
      periodLabel: label,
      startDate: currentStart.toISOString(),
      endDate: currentEnd.toISOString(),
      taxRate: Number(org?.taxRate || 0.15),
      taxInclusive: org?.taxInclusive ?? true,
      totalGrossSales: totalGrossSales.toNumber(),
      grossOutputVat: grossOutputVat.toNumber(),
      refundedOutputVat: refundedOutputVat.toNumber(),
      netOutputVatAfterRefunds: netOutputVat.toNumber(),
      disclaimer: 'Note: This report provides operational estimates of Net Output VAT collected on customer sales less completed returns. It does not constitute official tax filings for the Ethiopian Ministry of Revenue (MOR) or incorporate deductible Input VAT from supplier purchase invoices.',
    };
  }

  // =========================================================================
  // 11. INVENTORY VALUATION REPORT
  // =========================================================================
  async getInventoryValuationReport(organizationId: string, userRole: string, query: ReportQueryDto) {
    const role = normalizeRole(userRole);
    const canViewCostPrice = role === AppRole.OWNER;

    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        isArchived: false,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      include: {
        category: true,
        inventory: true,
      },
      orderBy: { name: 'asc' },
    });

    let totalCostValuation = new Prisma.Decimal(0);
    let totalRetailValuation = new Prisma.Decimal(0);
    let totalStockUnits = new Prisma.Decimal(0);

    const items = products.map((p) => {
      const stock = new Prisma.Decimal(p.inventory?.quantityOnHand || 0);
      const cost = new Prisma.Decimal(p.costPrice);
      const retail = new Prisma.Decimal(p.sellingPrice);
      const itemCostVal = stock.times(cost);
      const itemRetailVal = stock.times(retail);
      const potentialProfit = itemRetailVal.minus(itemCostVal);

      totalStockUnits = totalStockUnits.plus(stock);
      totalCostValuation = totalCostValuation.plus(itemCostVal);
      totalRetailValuation = totalRetailValuation.plus(itemRetailVal);

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category?.name || 'General',
        unit: p.unit,
        quantityOnHand: stock.toNumber(),
        costPrice: canViewCostPrice ? cost.toNumber() : null,
        sellingPrice: retail.toNumber(),
        totalCostValuation: canViewCostPrice ? itemCostVal.toNumber() : null,
        totalRetailValuation: itemRetailVal.toNumber(),
        potentialProfit: canViewCostPrice ? potentialProfit.toNumber() : null,
      };
    });

    return {
      totalProducts: products.length,
      totalStockUnits: totalStockUnits.toNumber(),
      totalCostValuation: canViewCostPrice ? totalCostValuation.toNumber() : null,
      totalRetailValuation: totalRetailValuation.toNumber(),
      totalPotentialProfit: canViewCostPrice ? totalRetailValuation.minus(totalCostValuation).toNumber() : null,
      items,
    };
  }

  // =========================================================================
  // 12. INVENTORY MOVEMENTS LEDGER (AUDIT TRAIL)
  // =========================================================================
  async getInventoryMovementsReport(organizationId: string, userRole: string, query: ReportQueryDto) {
    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const whereMovement: Prisma.InventoryMovementWhereInput = {
      organizationId,
      createdAt: { gte: currentStart, lt: currentEnd },
    };
    if (query.movementType) whereMovement.type = query.movementType;
    if (query.productId) whereMovement.productId = query.productId;

    const [total, movements] = await Promise.all([
      this.prisma.inventoryMovement.count({ where: whereMovement }),
      this.prisma.inventoryMovement.findMany({
        where: whereMovement,
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const items = movements.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      productId: m.productId,
      productName: m.product.name,
      sku: m.product.sku,
      unit: m.product.unit,
      type: m.type,
      quantity: Number(m.quantity),
      reason: m.reason,
      referenceId: m.referenceId,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================================================================
  // 13. PRODUCT PERFORMANCE REPORT
  // =========================================================================
  async getProductPerformanceReport(organizationId: string, userRole: string, query: ReportQueryDto) {
    const role = normalizeRole(userRole);
    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const [products, sales, returns] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          organizationId,
          isArchived: false,
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        },
        include: { category: true, inventory: true },
      }),
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: currentStart, lt: currentEnd },
          status: { not: SaleStatus.CANCELLED },
        },
        include: { items: true },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: currentStart, lt: currentEnd } },
            { completedAt: null, createdAt: { gte: currentStart, lt: currentEnd } },
          ],
        },
        include: { items: { include: { saleItem: true } } },
      }),
    ]);

    const perfMap: Record<
      string,
      {
        unitsSold: Prisma.Decimal;
        grossRevenue: Prisma.Decimal;
        costOfGoodsSold: Prisma.Decimal;
        returnedUnits: Prisma.Decimal;
        returnedRevenue: Prisma.Decimal;
      }
    > = {};

    for (const p of products) {
      perfMap[p.id] = {
        unitsSold: new Prisma.Decimal(0),
        grossRevenue: new Prisma.Decimal(0),
        costOfGoodsSold: new Prisma.Decimal(0),
        returnedUnits: new Prisma.Decimal(0),
        returnedRevenue: new Prisma.Decimal(0),
      };
    }

    for (const s of sales) {
      for (const item of s.items) {
        if (perfMap[item.productId]) {
          perfMap[item.productId].unitsSold = perfMap[item.productId].unitsSold.plus(item.quantity);
          perfMap[item.productId].grossRevenue = perfMap[item.productId].grossRevenue.plus(item.lineTotal);
          perfMap[item.productId].costOfGoodsSold = perfMap[item.productId].costOfGoodsSold.plus(
            new Prisma.Decimal(item.costPriceSnapshot).times(item.quantity),
          );
        }
      }
    }

    for (const r of returns) {
      for (const retItem of r.items) {
        if (perfMap[retItem.productId]) {
          perfMap[retItem.productId].returnedUnits = perfMap[retItem.productId].returnedUnits.plus(retItem.quantity);
          perfMap[retItem.productId].returnedRevenue = perfMap[retItem.productId].returnedRevenue.plus(retItem.refundAmount);
          if (r.restocked && retItem.saleItem) {
            const cost = new Prisma.Decimal(retItem.saleItem.costPriceSnapshot).times(retItem.quantity);
            perfMap[retItem.productId].costOfGoodsSold = perfMap[retItem.productId].costOfGoodsSold.minus(cost);
          }
        }
      }
    }

    const items = products.map((p) => {
      const perf = perfMap[p.id];
      const netUnits = perf.unitsSold.minus(perf.returnedUnits);
      const netSales = perf.grossRevenue.minus(perf.returnedRevenue);
      const grossProfit = netSales.minus(perf.costOfGoodsSold);
      const profitMargin = netSales.gt(0) ? Number(grossProfit.div(netSales).times(100).toFixed(1)) : 0;

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category?.name || 'General',
        unitsSold: perf.unitsSold.toNumber(),
        returnedUnits: perf.returnedUnits.toNumber(),
        netUnitsSold: netUnits.toNumber(),
        grossRevenue: perf.grossRevenue.toNumber(),
        netRevenue: netSales.toNumber(),
        costOfGoodsSold: role === AppRole.OWNER ? perf.costOfGoodsSold.toNumber() : null,
        grossProfit: role === AppRole.OWNER ? grossProfit.toNumber() : null,
        profitMargin: role === AppRole.OWNER ? profitMargin : null,
        currentStockOnHand: Number(p.inventory?.quantityOnHand || 0),
      };
    });

    return {
      items: items.sort((a, b) => b.netRevenue - a.netRevenue),
    };
  }

  // =========================================================================
  // 14. PURCHASE REPORTS: SUMMARY, SUPPLIERS, & HISTORY
  // =========================================================================
  async getPurchasesSummary(organizationId: string, userRole: string, query: ReportQueryDto) {
    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const purchases = await this.prisma.purchase.findMany({
      where: {
        organizationId,
        createdAt: { gte: currentStart, lt: currentEnd },
      },
      include: {
        supplier: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalOrderedValue = new Prisma.Decimal(0);
    let totalReceivedValue = new Prisma.Decimal(0);
    const statusCounts: Record<PurchaseStatus, { count: number; totalAmount: Prisma.Decimal }> = {
      [PurchaseStatus.DRAFT]: { count: 0, totalAmount: new Prisma.Decimal(0) },
      [PurchaseStatus.ORDERED]: { count: 0, totalAmount: new Prisma.Decimal(0) },
      [PurchaseStatus.PARTIALLY_RECEIVED]: { count: 0, totalAmount: new Prisma.Decimal(0) },
      [PurchaseStatus.RECEIVED]: { count: 0, totalAmount: new Prisma.Decimal(0) },
      [PurchaseStatus.CANCELLED]: { count: 0, totalAmount: new Prisma.Decimal(0) },
    };

    for (const po of purchases) {
      statusCounts[po.status].count++;
      statusCounts[po.status].totalAmount = statusCounts[po.status].totalAmount.plus(po.totalAmount);

      if (po.status !== PurchaseStatus.CANCELLED) {
        totalOrderedValue = totalOrderedValue.plus(po.totalAmount);
        for (const item of po.items) {
          totalReceivedValue = totalReceivedValue.plus(new Prisma.Decimal(item.unitCost).times(item.receivedQty));
        }
      }
    }

    const byStatus = Object.entries(statusCounts).map(([status, val]) => ({
      status,
      count: val.count,
      totalAmount: val.totalAmount.toNumber(),
    }));

    return {
      totalPurchases: purchases.length,
      totalOrderedValue: totalOrderedValue.toNumber(),
      totalReceivedValue: totalReceivedValue.toNumber(),
      fulfillmentRate: totalOrderedValue.gt(0)
        ? Number(totalReceivedValue.div(totalOrderedValue).times(100).toFixed(1))
        : 0,
      byStatus,
    };
  }

  async getPurchasesSuppliers(organizationId: string, userRole: string, query: ReportQueryDto) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { organizationId, isArchived: false },
      include: {
        purchases: {
          include: { items: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const items = suppliers.map((sup) => {
      let orderedVal = new Prisma.Decimal(0);
      let receivedVal = new Prisma.Decimal(0);
      let orderCount = 0;

      for (const po of sup.purchases) {
        if (po.status !== PurchaseStatus.CANCELLED) {
          orderCount++;
          orderedVal = orderedVal.plus(po.totalAmount);
          for (const item of po.items) {
            receivedVal = receivedVal.plus(new Prisma.Decimal(item.unitCost).times(item.receivedQty));
          }
        }
      }

      return {
        id: sup.id,
        name: sup.name,
        contactName: sup.contactName,
        phoneNumber: sup.phoneNumber,
        email: sup.email,
        orderCount,
        totalOrderedValue: orderedVal.toNumber(),
        totalReceivedValue: receivedVal.toNumber(),
        fulfillmentRate: orderedVal.gt(0)
          ? Number(receivedVal.div(orderedVal).times(100).toFixed(1))
          : 0,
      };
    });

    return {
      items: items.sort((a, b) => b.totalOrderedValue - a.totalOrderedValue),
    };
  }

  async getPurchasesHistory(organizationId: string, userRole: string, query: ReportQueryDto) {
    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const wherePurchase: Prisma.PurchaseWhereInput = {
      organizationId,
      createdAt: { gte: currentStart, lt: currentEnd },
    };
    if (query.supplierId) wherePurchase.supplierId = query.supplierId;
    if (query.purchaseStatus) wherePurchase.status = query.purchaseStatus;

    const [total, purchases] = await Promise.all([
      this.prisma.purchase.count({ where: wherePurchase }),
      this.prisma.purchase.findMany({
        where: wherePurchase,
        include: { supplier: true, items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const items = purchases.map((po) => {
      let totalOrderedQty = 0;
      let totalReceivedQty = 0;
      for (const item of po.items) {
        totalOrderedQty += Number(item.orderedQty);
        totalReceivedQty += Number(item.receivedQty);
      }

      return {
        id: po.id,
        orderNumber: po.orderNumber,
        createdAt: po.createdAt,
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        status: po.status,
        totalAmount: Number(po.totalAmount),
        orderedQty: totalOrderedQty,
        receivedQty: totalReceivedQty,
        itemsCount: po.items.length,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================================================================
  // 15. EXPENSE REPORTS: SUMMARY, CATEGORIES & TRENDS
  // =========================================================================
  async getExpensesSummary(organizationId: string, userRole: string, query: ReportQueryDto) {
    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd, label } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: currentStart, lt: currentEnd },
      },
      orderBy: { date: 'desc' },
    });

    let totalAmount = new Prisma.Decimal(0);
    const byCategoryMap: Record<string, Prisma.Decimal> = {};
    const byMethodMap: Record<PaymentMethod, Prisma.Decimal> = {
      [PaymentMethod.CASH]: new Prisma.Decimal(0),
      [PaymentMethod.TELEBIRR]: new Prisma.Decimal(0),
      [PaymentMethod.CBE_BIRR]: new Prisma.Decimal(0),
      [PaymentMethod.BANK_TRANSFER]: new Prisma.Decimal(0),
      [PaymentMethod.OTHER]: new Prisma.Decimal(0),
    };
    const trendMap: Record<string, Prisma.Decimal> = {};

    for (const e of expenses) {
      totalAmount = totalAmount.plus(e.amount);

      const cat = e.category || 'General';
      if (!byCategoryMap[cat]) byCategoryMap[cat] = new Prisma.Decimal(0);
      byCategoryMap[cat] = byCategoryMap[cat].plus(e.amount);

      byMethodMap[e.paymentMethod] = byMethodMap[e.paymentMethod].plus(e.amount);

      const dayKey = formatToBusinessDate(e.date, tz);
      if (!trendMap[dayKey]) trendMap[dayKey] = new Prisma.Decimal(0);
      trendMap[dayKey] = trendMap[dayKey].plus(e.amount);
    }

    const byCategory = Object.entries(byCategoryMap).map(([category, amt]) => ({
      category,
      amount: amt.toNumber(),
      percentage: totalAmount.gt(0) ? Number(amt.div(totalAmount).times(100).toFixed(1)) : 0,
    }));

    const byPaymentMethod = Object.entries(byMethodMap).map(([method, amt]) => ({
      method,
      amount: amt.toNumber(),
      percentage: totalAmount.gt(0) ? Number(amt.div(totalAmount).times(100).toFixed(1)) : 0,
    }));

    const trend = Object.entries(trendMap)
      .map(([date, amt]) => ({ date, amount: amt.toNumber() }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      periodLabel: label,
      startDate: currentStart.toISOString(),
      endDate: currentEnd.toISOString(),
      totalAmount: totalAmount.toNumber(),
      expenseCount: expenses.length,
      byCategory: byCategory.sort((a, b) => b.amount - a.amount),
      byPaymentMethod,
      trend,
      items: expenses.slice(0, 50).map((e) => ({
        id: e.id,
        date: e.date,
        category: e.category,
        description: e.description,
        amount: Number(e.amount),
        paymentMethod: e.paymentMethod,
      })),
    };
  }

  // =========================================================================
  // 16. STAFF PERFORMANCE REPORT
  // =========================================================================
  async getStaffPerformanceReport(organizationId: string, userRole: string, query: ReportQueryDto) {
    const tz = await this.getOrgTimezone(organizationId);
    const { currentStart, currentEnd, label } = resolveDatePreset(
      query.preset,
      tz,
      query.startDate,
      query.endDate,
    );

    const [members, sales, returns] = await Promise.all([
      this.prisma.member.findMany({
        where: { organizationId },
        include: { user: true },
      }),
      this.prisma.sale.findMany({
        where: {
          organizationId,
          createdAt: { gte: currentStart, lt: currentEnd },
          status: { not: SaleStatus.CANCELLED },
        },
        include: { items: true },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: ReturnStatus.COMPLETED,
          OR: [
            { completedAt: { gte: currentStart, lt: currentEnd } },
            { completedAt: null, createdAt: { gte: currentStart, lt: currentEnd } },
          ],
        },
      }),
    ]);

    const staffMap: Record<
      string,
      {
        salesCount: number;
        grossSales: Prisma.Decimal;
        returnCount: number;
        returnCredits: Prisma.Decimal;
        itemsSold: number;
      }
    > = {};

    for (const m of members) {
      staffMap[m.userId] = {
        salesCount: 0,
        grossSales: new Prisma.Decimal(0),
        returnCount: 0,
        returnCredits: new Prisma.Decimal(0),
        itemsSold: 0,
      };
    }

    for (const s of sales) {
      if (staffMap[s.cashierUserId]) {
        staffMap[s.cashierUserId].salesCount++;
        staffMap[s.cashierUserId].grossSales = staffMap[s.cashierUserId].grossSales.plus(s.totalAmount);
        for (const item of s.items) {
          staffMap[s.cashierUserId].itemsSold += Number(item.quantity);
        }
      }
    }

    for (const r of returns) {
      if (r.cashierUserId && staffMap[r.cashierUserId]) {
        staffMap[r.cashierUserId].returnCount++;
        const credit = r.returnCredit && new Prisma.Decimal(r.returnCredit).gt(0)
          ? new Prisma.Decimal(r.returnCredit)
          : new Prisma.Decimal(r.refundAmount);
        staffMap[r.cashierUserId].returnCredits = staffMap[r.cashierUserId].returnCredits.plus(credit);
      }
    }

    const items = members.map((m) => {
      const perf = staffMap[m.userId] || {
        salesCount: 0,
        grossSales: new Prisma.Decimal(0),
        returnCount: 0,
        returnCredits: new Prisma.Decimal(0),
        itemsSold: 0,
      };
      const netSales = perf.grossSales.minus(perf.returnCredits);
      const avgValue = perf.salesCount > 0 ? Number(netSales.div(perf.salesCount).toFixed(2)) : 0;

      return {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        salesCount: perf.salesCount,
        grossSales: perf.grossSales.toNumber(),
        returnCount: perf.returnCount,
        returnCredits: perf.returnCredits.toNumber(),
        netSales: netSales.toNumber(),
        averageTransactionValue: avgValue,
        itemsSold: perf.itemsSold,
      };
    });

    return {
      periodLabel: label,
      items: items.sort((a, b) => b.netSales - a.netSales),
    };
  }

  // =========================================================================
  // 17. SECURE CSV EXPORT SERVICE (WITH FORMULA INJECTION DEFENSE)
  // =========================================================================
  async exportReportCsv(organizationId: string, userRole: string, query: CsvExportQueryDto): Promise<{ filename: string; csv: string }> {
    const role = normalizeRole(userRole);
    const tz = await this.getOrgTimezone(organizationId);
    const timestamp = formatToBusinessDate(new Date(), tz);

    switch (query.reportType) {
      case 'sales_summary': {
        const data = await this.getSalesSummary(organizationId, userRole, query);
        const headers = ['Metric', 'Value (ETB)'];
        const rows = [
          ['Period', data.periodLabel],
          ['Gross Sales', data.grossSales],
          ['Discounts', data.totalDiscounts],
          ['Return Credits', data.returnCredits],
          ['Net Sales', data.netSales],
          ['COGS', data.cogs !== null ? data.cogs : 'RESTRICTED'],
          ['Gross Profit', data.grossProfit !== null ? data.grossProfit : 'RESTRICTED'],
          ['Gross Margin (%)', data.grossMargin !== null ? `${data.grossMargin}%` : 'RESTRICTED'],
          ['Average Transaction Value', data.averageTransactionValue],
          ['Items Sold', data.totalItemsSold],
          ['Total Transactions', data.totalTransactions],
        ];
        return {
          filename: `sales_summary_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'sales_details': {
        const details = await this.getSalesDetails(organizationId, userRole, { ...query, limit: 5000 });
        const headers = [
          'Receipt Number',
          'Date',
          'Cashier',
          'Items Count',
          'Subtotal',
          'Discount',
          'Tax Amount',
          'Total Gross',
          'Return Credit',
          'Net Amount',
          'Payment Status',
          'Sale Status',
        ];
        const rows = details.items.map((s) => [
          s.receiptNumber,
          formatToBusinessDate(new Date(s.createdAt), tz),
          s.cashierName,
          s.itemsCount,
          s.subtotal,
          s.discountAmount,
          s.taxAmount,
          s.totalAmount,
          s.returnCredit,
          s.netAmount,
          s.paymentStatus,
          s.status,
        ]);
        return {
          filename: `sales_details_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'profit_loss': {
        if (role !== AppRole.OWNER) {
          throw new ForbiddenException('Access denied: P&L export is restricted to business owners.');
        }
        const pl = await this.getProfitAndLossReport(organizationId, userRole, query);
        const headers = ['Financial Category', 'Line Item', 'Amount (ETB)'];
        const rows = [
          ['Revenue', 'Gross Invoiced Sales', pl.revenue.grossSales],
          ['Revenue', 'In-line Discounts (Memorandum)', pl.revenue.discounts],
          ['Revenue', 'Less: Return Credits', pl.revenue.returnCredits],
          ['Revenue', 'Net Sales Revenue', pl.revenue.netSales],
          ['Cost of Goods Sold', 'Gross Inventory Cost', pl.costOfGoodsSold.grossCost],
          ['Cost of Goods Sold', 'Less: Restocked Returns Reversal', pl.costOfGoodsSold.restockedReturnCostReversal],
          ['Cost of Goods Sold', 'Net COGS', pl.costOfGoodsSold.netCostOfGoodsSold],
          ['Gross Profit', 'Gross Profit', pl.grossProfit],
          ['Gross Profit Margin', 'Margin (%)', `${pl.grossMarginPercentage}%`],
          ...pl.operatingExpenses.items.map((e) => ['Operating Expenses', e.category, e.amount]),
          ['Operating Expenses', 'Total Operating Expenses', pl.operatingExpenses.totalExpenses],
          ['Net Operating Profit', 'Net Profit', pl.netOperatingProfit],
          ['Net Operating Margin', 'Margin (%)', `${pl.netMarginPercentage}%`],
        ];
        return {
          filename: `profit_and_loss_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'receivables': {
        if (role !== AppRole.OWNER) {
          throw new ForbiddenException('Access denied: Receivables export is restricted to business owners.');
        }
        const recv = await this.getReceivablesReport(organizationId, userRole, query);
        const headers = [
          'Receipt Number',
          'Date',
          'Cashier',
          'Total Amount (ETB)',
          'Paid Amount (ETB)',
          'Return Credit (ETB)',
          'Refund Disbursed (ETB)',
          'Balance Due (ETB)',
          'Days Outstanding',
          'Status',
        ];
        const rows = recv.receivables.map((r: any) => [
          r.receiptNumber,
          formatToBusinessDate(new Date(r.createdAt), tz),
          r.cashierName,
          r.totalAmount,
          r.paidAmount,
          r.returnCredit,
          r.refundDisbursed,
          r.balanceDue,
          r.daysOutstanding,
          r.status,
        ]);
        return {
          filename: `receivables_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'tax_summary': {
        if (role !== AppRole.OWNER) {
          throw new ForbiddenException('Access denied: Tax summary export is restricted to business owners.');
        }
        const tax = await this.getTaxSummaryReport(organizationId, userRole, query);
        const headers = ['Financial Category', 'Line Item', 'Value (ETB)'];
        const rows = [
          ['Configuration', 'Period', tax.periodLabel],
          ['Configuration', 'Tax Rate', `${(tax.taxRate * 100).toFixed(0)}%`],
          ['Configuration', 'Tax Mode', tax.taxInclusive ? 'Tax Inclusive' : 'Tax Exclusive'],
          ['Sales & Output VAT', 'Total Gross Sales', tax.totalGrossSales],
          ['Sales & Output VAT', 'Gross Output VAT Invoiced', tax.grossOutputVat],
          ['Sales & Output VAT', 'Output VAT Refunded on Returns', tax.refundedOutputVat],
          ['Sales & Output VAT', 'Net Output VAT After Returns', tax.netOutputVatAfterRefunds],
          ['Compliance Notice', 'Disclaimer', tax.disclaimer],
        ];
        return {
          filename: `tax_summary_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'cash_flow': {
        if (role !== AppRole.OWNER) {
          throw new ForbiddenException('Access denied: Cash flow export is restricted to business owners.');
        }
        const cf = await this.getCashFlowReport(organizationId, userRole, query);
        const headers = ['Category', 'Channel / Item', 'Amount (ETB)'];
        const rows = [
          ['Inflows', 'Cash Payments', cf.inflows.byMethod.cash],
          ['Inflows', 'Telebirr Payments', cf.inflows.byMethod.telebirr],
          ['Inflows', 'CBE Birr Payments', cf.inflows.byMethod.cbeBirr],
          ['Inflows', 'Bank Transfer Payments', cf.inflows.byMethod.bankTransfer],
          ['Inflows', 'Other Digital Payments', cf.inflows.byMethod.other],
          ['Inflows', 'Total Cash Inflows', cf.inflows.totalInflows],
          ['Outflows', 'Refunds Disbursed to Customers', cf.outflows.refundsDisbursed],
          ['Outflows', 'Customer Credits Disbursed', cf.outflows.customerCreditDisbursed],
          ['Outflows', 'Operating Expenses Paid', cf.outflows.operatingExpenses],
          ['Outflows', 'Total Cash Outflows', cf.outflows.totalOutflows],
          ['Summary', 'Overall Net Cash Flow', cf.netCashFlow],
          ['Summary', 'Physical Cash Net Movement', cf.netPhysicalCashMovement],
        ];
        return {
          filename: `cash_flow_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'inventory_valuation': {
        const val = await this.getInventoryValuationReport(organizationId, userRole, query);
        const headers = [
          'Product Name',
          'SKU',
          'Category',
          'Unit',
          'Stock On Hand',
          'Cost Price (ETB)',
          'Selling Price (ETB)',
          'Total Cost Valuation',
          'Total Retail Valuation',
          'Potential Profit',
        ];
        const rows = val.items.map((i) => [
          i.name,
          i.sku,
          i.category,
          i.unit,
          i.quantityOnHand,
          i.costPrice !== null ? i.costPrice : 'RESTRICTED',
          i.sellingPrice,
          i.totalCostValuation !== null ? i.totalCostValuation : 'RESTRICTED',
          i.totalRetailValuation,
          i.potentialProfit !== null ? i.potentialProfit : 'RESTRICTED',
        ]);
        return {
          filename: `inventory_valuation_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'inventory_movements': {
        const mov = await this.getInventoryMovementsReport(organizationId, userRole, { ...query, limit: 5000 });
        const headers = ['Date', 'Product', 'SKU', 'Movement Type', 'Quantity', 'Reason', 'Reference ID'];
        const rows = mov.items.map((m) => [
          formatToBusinessDate(new Date(m.createdAt), tz),
          m.productName,
          m.sku,
          m.type,
          m.quantity,
          m.reason || '',
          m.referenceId || '',
        ]);
        return {
          filename: `inventory_movements_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'purchases': {
        if (!roleHasPermission(role, AppPermission.PURCHASES_VIEW)) {
          throw new ForbiddenException('Access denied: Purchases export requires PURCHASES_VIEW permission.');
        }
        const po = await this.getPurchasesHistory(organizationId, userRole, { ...query, limit: 5000 });
        const headers = ['Order Number', 'Date', 'Supplier', 'Status', 'Ordered Qty', 'Received Qty', 'Total Amount (ETB)'];
        const rows = po.items.map((p) => [
          p.orderNumber,
          formatToBusinessDate(new Date(p.createdAt), tz),
          p.supplierName,
          p.status,
          p.orderedQty,
          p.receivedQty,
          p.totalAmount,
        ]);
        return {
          filename: `purchases_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'expenses': {
        if (!roleHasPermission(role, AppPermission.EXPENSES_VIEW)) {
          throw new ForbiddenException('Access denied: Expenses export requires EXPENSES_VIEW permission.');
        }
        const exp = await this.getExpensesSummary(organizationId, userRole, query);
        const headers = ['Date', 'Category', 'Description', 'Amount (ETB)', 'Payment Method'];
        const rows = exp.items.map((e) => [
          formatToBusinessDate(new Date(e.date), tz),
          e.category,
          e.description || '',
          e.amount,
          e.paymentMethod,
        ]);
        return {
          filename: `expenses_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      case 'staff': {
        if (!roleHasPermission(role, AppPermission.STAFF_VIEW)) {
          throw new ForbiddenException('Access denied: Staff performance export requires STAFF_VIEW permission.');
        }
        const st = await this.getStaffPerformanceReport(organizationId, userRole, query);
        const headers = ['Staff Name', 'Email', 'Role', 'Sales Count', 'Gross Sales', 'Returns Count', 'Return Credits', 'Net Sales', 'Average Ticket', 'Items Sold'];
        const rows = st.items.map((s) => [
          s.name,
          s.email,
          s.role,
          s.salesCount,
          s.grossSales,
          s.returnCount,
          s.returnCredits,
          s.netSales,
          s.averageTransactionValue,
          s.itemsSold,
        ]);
        return {
          filename: `staff_performance_${timestamp}.csv`,
          csv: generateCsvString(headers, rows),
        };
      }

      default:
        throw new NotFoundException(`Unknown export report type: ${query.reportType}`);
    }
  }
}
