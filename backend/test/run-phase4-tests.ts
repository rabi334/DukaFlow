import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PaymentMethod, SaleStatus, ReturnStatus, PurchaseStatus, StockMovementType, MemberStatus } from '@prisma/client';
import { resolveDatePreset } from '../src/modules/reports/utils/report-date.utils';
import { DatePreset } from '../src/modules/reports/dto/report-query.dto';

async function runPhase4Tests() {
  console.log('========================================================================');
  console.log('  DUKAFLOW PHASE 4: REPORTS & BUSINESS ANALYTICS VERIFICATION SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0);

  const serverUrl = await app.getUrl();
  const prisma = app.get(PrismaService);

  const ts = Date.now();
  let passedTests = 0;
  let failedTests = 0;

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`• Testing: ${name}... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passedTests++;
    } catch (err: any) {
      console.log(`❌ FAILED: ${err.message}`);
      failedTests++;
    }
  }

  // --- SEED TEST TENANT & USERS ---
  console.log('--- Setting up test workspace for Phase 4 verification ---');

  const ownerEmail = `owner_p4_${ts}@dukaflow.com`;
  const managerEmail = `mgr_p4_${ts}@dukaflow.com`;
  const cashierEmail = `cash_p4_${ts}@dukaflow.com`;
  const invStaffEmail = `inv_p4_${ts}@dukaflow.com`;
  const tenantBEmail = `owner_b_${ts}@dukaflow.com`;

  // 1. Register Owner
  const ownerReg = await fetch(`${serverUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Phase4 Owner', email: ownerEmail, password: 'Password123!' }),
  });
  const ownerData = await ownerReg.json();
  const ownerToken = ownerData.token;
  const ownerUserId = ownerData.user.id;

  // Onboard Shop
  const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: `Phase4 Store ${ts}`, city: 'Addis Ababa', currency: 'ETB', timezone: 'Africa/Addis_Ababa' }),
  });
  const orgData = await orgRes.json();
  const orgId = orgData.business.id;

  const ownerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': orgId };

  // 2. Register & Add Manager
  const mgrReg = await fetch(`${serverUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Phase4 Manager', email: managerEmail, password: 'Password123!' }),
  });
  const mgrData = await mgrReg.json();
  const mgrToken = mgrData.token;
  await prisma.member.create({
    data: { organizationId: orgId, userId: mgrData.user.id, role: 'manager', status: MemberStatus.ACTIVE },
  });
  const managerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${mgrToken}`, 'x-organization-id': orgId };

  // 3. Register & Add Cashier
  const cashReg = await fetch(`${serverUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Phase4 Cashier', email: cashierEmail, password: 'Password123!' }),
  });
  const cashData = await cashReg.json();
  const cashToken = cashData.token;
  const cashierUserId = cashData.user.id;
  await prisma.member.create({
    data: { organizationId: orgId, userId: cashierUserId, role: 'cashier', status: MemberStatus.ACTIVE },
  });
  const cashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashToken}`, 'x-organization-id': orgId };

  // 4. Register & Add Inventory Staff
  const invReg = await fetch(`${serverUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Phase4 InvStaff', email: invStaffEmail, password: 'Password123!' }),
  });
  const invData = await invReg.json();
  const invToken = invData.token;
  await prisma.member.create({
    data: { organizationId: orgId, userId: invData.user.id, role: 'inventory_staff', status: MemberStatus.ACTIVE },
  });
  const invStaffHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${invToken}`, 'x-organization-id': orgId };

  // 5. Register Tenant B for isolation checks
  const tenBReg = await fetch(`${serverUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'TenantB Owner', email: tenantBEmail, password: 'Password123!' }),
  });
  const tenBData = await tenBReg.json();
  const tenBToken = tenBData.token;
  const tenBOrgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenBToken}` },
    body: JSON.stringify({ name: `TenantB Store ${ts}`, city: 'Hawassa' }),
  });
  const tenBOrgData = await tenBOrgRes.json();
  const tenBOrgId = tenBOrgData.business.id;
  const tenBHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${tenBToken}`, 'x-organization-id': tenBOrgId };

  // Seed Categories & Products
  const catRes = await fetch(`${serverUrl}/api/v1/categories`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ name: `Electronics ${ts}`, description: 'Devices & Gadgets' }),
  });
  const category = await catRes.json();

  // Product 1: In stock
  const p1Res = await fetch(`${serverUrl}/api/v1/products`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      name: `Smartphone ${ts}`,
      sku: `PHONE-${ts}`,
      barcode: `BC-PHONE-${ts}`,
      categoryId: category.id,
      costPrice: 500,
      sellingPrice: 800,
      initialStock: 20,
      minStockThreshold: 5,
    }),
  });
  const prod1 = await p1Res.json();

  // Product 2: Low stock with formula injection payload
  const p2Res = await fetch(`${serverUrl}/api/v1/products`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      name: `=cmd|' /C calc'!A0 ${ts}`, // Tests formula injection in name
      sku: `CHG-${ts}`,
      categoryId: category.id,
      costPrice: 50,
      sellingPrice: 100,
      initialStock: 3,
      minStockThreshold: 5,
    }),
  });
  const prod2 = await p2Res.json();

  // Product 3: Out of stock
  const p3Res = await fetch(`${serverUrl}/api/v1/products`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      name: `Earphones ${ts}`,
      sku: `EAR-${ts}`,
      categoryId: category.id,
      costPrice: 40,
      sellingPrice: 80,
      initialStock: 0,
      minStockThreshold: 2,
    }),
  });
  const prod3 = await p3Res.json();

  // Seed Supplier & Purchases
  const supRes = await fetch(`${serverUrl}/api/v1/purchases/suppliers`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ name: `Tech Imports Ltd ${ts}`, phoneNumber: '+251911223344' }),
  });
  const supplier = await supRes.json();

  const poRes = await fetch(`${serverUrl}/api/v1/purchases`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      supplierId: supplier.id,
      items: [{ productId: prod1.id, orderedQty: 10, unitCost: 500 }],
    }),
  });
  const purchase = await poRes.json();

  // Seed Sales Transactions:
  // Sale 1: Fully paid via CASH (1x Smartphone = 800 ETB, cost = 500 ETB)
  const sale1Res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
    method: 'POST',
    headers: cashierHeaders,
    body: JSON.stringify({
      items: [{ productId: prod1.id, quantity: 1, unitPrice: 800 }],
      paymentMethod: PaymentMethod.CASH,
      amountPaid: 800,
    }),
  });
  const sale1 = await sale1Res.json();

  // Sale 2: Paid via TELEBIRR (2x Charger = 200 ETB, cost = 100 ETB)
  const sale2Res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
    method: 'POST',
    headers: cashierHeaders,
    body: JSON.stringify({
      items: [{ productId: prod2.id, quantity: 2, unitPrice: 100 }],
      paymentMethod: PaymentMethod.TELEBIRR,
      amountPaid: 200,
    }),
  });
  const sale2 = await sale2Res.json();

  // Sale 3: Partially paid via CASH (1x Smartphone = 800 ETB, paid 500 ETB, 300 ETB receivable)
  const sale3Res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
    method: 'POST',
    headers: cashierHeaders,
    body: JSON.stringify({
      items: [{ productId: prod1.id, quantity: 1, unitPrice: 800 }],
      paymentMethod: PaymentMethod.CASH,
      amountPaid: 500,
    }),
  });
  const sale3 = await sale3Res.json();

  // Seed Return: Return 1 unit from Sale 2 (1x Charger = 100 ETB, restocked = true)
  const dbSale2 = await prisma.sale.findUnique({ where: { id: sale2.id }, include: { items: true } });
  const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale2.id}/return`, {
    method: 'POST',
    headers: cashierHeaders,
    body: JSON.stringify({
      items: [{ saleItemId: dbSale2!.items[0].id, quantity: 1 }],
      reason: 'Wrong model',
      refundMethod: PaymentMethod.TELEBIRR,
      restockInventory: true,
    }),
  });
  const returnObj = await retRes.json();

  // Seed Operating Expense: Rent = 250 ETB via CASH
  const expRes = await fetch(`${serverUrl}/api/v1/expenses`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      category: 'Rent',
      amount: 250,
      description: 'Monthly office corner',
      paymentMethod: PaymentMethod.CASH,
    }),
  });
  const expense = await expRes.json();

  console.log('Setup finished. Beginning test cases...\n');

  // =========================================================================
  // 1. BUSINESS OVERVIEW DASHBOARD
  // =========================================================================
  await test('1. Dashboard Overview: Owner receives 8 KPI comparisons, alerts & charts in ETB', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/dashboard?preset=this_month`, { headers: ownerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data = await res.json();

    if (data.role !== 'owner') throw new Error(`Expected role owner, got ${data.role}`);
    if (!data.comparison) throw new Error('Missing comparison object');

    // Check all 8 KPI comparison metrics exist
    const { grossSales, netSales, totalPaymentsReceived, outstandingReceivables, costOfGoodsSold, grossProfit, totalExpenses, netOperatingProfit } = data.comparison;
    if (!grossSales || !netSales || !totalPaymentsReceived || !outstandingReceivables || !costOfGoodsSold || !grossProfit || !totalExpenses || !netOperatingProfit) {
      throw new Error('Missing one of the 8 required KPI comparison cards');
    }

    // Gross Sales = 800 + 200 + 800 = 1800 ETB
    if (grossSales.current !== 1800) throw new Error(`Expected grossSales 1800, got ${grossSales.current}`);
    // Return Credit = 100 ETB, Net Sales = 1700 ETB
    if (netSales.current !== 1700) throw new Error(`Expected netSales 1700, got ${netSales.current}`);
    // Payments = 800 + 200 + 500 = 1500 ETB
    if (totalPaymentsReceived.current !== 1500) throw new Error(`Expected payments 1500, got ${totalPaymentsReceived.current}`);
    // Receivables = 300 ETB
    if (outstandingReceivables.current !== 300) throw new Error(`Expected receivables 300, got ${outstandingReceivables.current}`);
    // COGS: 500 (Sale1) + 100 (Sale2) + 500 (Sale3) - 50 (restocked reversal) = 1050 ETB
    if (costOfGoodsSold.current !== 1050) throw new Error(`Expected COGS 1050, got ${costOfGoodsSold.current}`);
    // Gross Profit = 1700 - 1050 = 650 ETB
    if (grossProfit.current !== 650) throw new Error(`Expected grossProfit 650, got ${grossProfit.current}`);
    // Expenses = 250 ETB
    if (totalExpenses.current !== 250) throw new Error(`Expected expenses 250, got ${totalExpenses.current}`);
    // Net Operating Profit = 650 - 250 = 400 ETB
    if (netOperatingProfit.current !== 400) throw new Error(`Expected netOperatingProfit 400, got ${netOperatingProfit.current}`);

    // Visualizations
    if (!Array.isArray(data.visualizations?.paymentMethods)) throw new Error('Missing paymentMethods visualization');
    if (!Array.isArray(data.visualizations?.topProducts)) throw new Error('Missing topProducts visualization');
    if (!Array.isArray(data.visualizations?.salesByCategory)) throw new Error('Missing salesByCategory visualization');

    // Operational alerts
    if (data.alerts?.lowStockCount < 1) throw new Error(`Expected lowStockCount >= 1, got ${data.alerts?.lowStockCount}`);
    if (data.alerts?.outOfStockCount < 1) throw new Error(`Expected outOfStockCount >= 1, got ${data.alerts?.outOfStockCount}`);
    if (data.alerts?.pendingPurchaseOrdersCount < 1) throw new Error('Expected pending purchase order alert');
  });

  // =========================================================================
  // 2. ROLE-BASED ACCESS & SENSITIVE DATA MASKING
  // =========================================================================
  await test('2. RBAC Masking: Manager gets operational metrics; wholesale COGS & Net Profit are masked (null)', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/dashboard?preset=this_month`, { headers: managerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data = await res.json();

    if (data.role !== 'manager') throw new Error(`Expected role manager, got ${data.role}`);
    if (data.cogsMonth !== undefined) throw new Error('Manager should not receive wholesale cogsMonth');
    if (data.netProfit !== undefined) throw new Error('Manager should not receive netProfit');

    // In KPI comparison, COGS and Profit must be null for Manager
    if (data.comparison.costOfGoodsSold !== null) throw new Error('Expected COGS to be masked for manager');
    if (data.comparison.grossProfit !== null) throw new Error('Expected gross profit to be masked for manager');
    if (data.comparison.netOperatingProfit !== null) throw new Error('Expected net operating profit to be masked for manager');
    // Operational metrics are accessible
    if (data.comparison.grossSales.current !== 1800) throw new Error('Manager should see gross sales');
  });

  await test('3. RBAC Rejection: Cashier & Inventory Staff receive 403 Forbidden on dashboard', async () => {
    const cashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: cashierHeaders });
    if (cashRes.status !== 403) throw new Error(`Expected 403 for cashier on dashboard, got ${cashRes.status}`);

    const invRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: invStaffHeaders });
    if (invRes.status !== 403) throw new Error(`Expected 403 for inventory staff on dashboard, got ${invRes.status}`);
  });

  await test('4. Tenant Isolation: Tenant B cannot query Tenant A dashboard reports (403)', async () => {
    const leakRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenBToken}`, 'x-organization-id': orgId },
    });
    if (leakRes.status !== 403) throw new Error(`Expected 403 on cross-tenant report query, got ${leakRes.status}`);
  });

  // =========================================================================
  // 3. SALES REPORTS (SUMMARY & DETAILED TRANSACTIONS)
  // =========================================================================
  await test('5. Sales Summary: correctly calculates gross, return credits, net, ATV, and breakdowns', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/sales/summary?preset=this_month`, { headers: ownerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data = await res.json();

    if (data.grossSales !== 1800) throw new Error(`Expected grossSales 1800, got ${data.grossSales}`);
    if (data.returnCredits !== 100) throw new Error(`Expected returnCredits 100, got ${data.returnCredits}`);
    if (data.netSales !== 1700) throw new Error(`Expected netSales 1700, got ${data.netSales}`);
    if (data.totalTransactions !== 3) throw new Error(`Expected totalTransactions 3, got ${data.totalTransactions}`);
    if (data.averageTransactionValue !== Number((1700 / 3).toFixed(2))) {
      throw new Error(`Expected ATV ~566.67, got ${data.averageTransactionValue}`);
    }

    if (!Array.isArray(data.byDate)) throw new Error('Missing byDate breakdown');
    if (!Array.isArray(data.byProduct)) throw new Error('Missing byProduct breakdown');
    if (!Array.isArray(data.byCategory)) throw new Error('Missing byCategory breakdown');
    if (!Array.isArray(data.byCashier)) throw new Error('Missing byCashier breakdown');
    if (!Array.isArray(data.byPaymentMethod)) throw new Error('Missing byPaymentMethod breakdown');
  });

  await test('6. Sales Details Table: filters by cashier, status, and pagination', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/sales/details?preset=this_month&cashierId=${cashierUserId}&limit=10`, {
      headers: ownerHeaders,
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data = await res.json();

    if (!Array.isArray(data.items)) throw new Error('Expected items array');
    if (data.items.length !== 3) throw new Error(`Expected 3 sales for cashier, got ${data.items.length}`);
    if (!data.pagination || data.pagination.total !== 3) throw new Error('Invalid pagination object');

    // Verify fields on first item
    const item = data.items[0];
    if (!item.receiptNumber || item.totalAmount === undefined || item.netAmount === undefined || !item.paymentStatus) {
      throw new Error('Item missing receiptNumber, totalAmount, netAmount, or paymentStatus');
    }
  });

  // =========================================================================
  // 4. FINANCIAL REPORTS (P&L, CASH FLOW, RECEIVABLES, TAX SUMMARY)
  // =========================================================================
  await test('7. Profit & Loss Statement: Owner only; Net Operating Profit = Gross Profit - Expenses', async () => {
    // 1. Manager blocked
    const mgrRes = await fetch(`${serverUrl}/api/v1/reports/financial/profit-loss`, { headers: managerHeaders });
    if (mgrRes.status !== 403) throw new Error(`Expected 403 for manager on P&L, got ${mgrRes.status}`);

    // 2. Owner success
    const res = await fetch(`${serverUrl}/api/v1/reports/financial/profit-loss?preset=this_month`, { headers: ownerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const pl = await res.json();

    if (pl.revenue.grossSales !== 1800) throw new Error(`Expected grossSales 1800, got ${pl.revenue.grossSales}`);
    if (pl.revenue.returnCredits !== 100) throw new Error(`Expected returnCredits 100, got ${pl.revenue.returnCredits}`);
    if (pl.revenue.netSales !== 1700) throw new Error(`Expected netSales 1700, got ${pl.revenue.netSales}`);
    if (pl.costOfGoodsSold.netCostOfGoodsSold !== 1050) {
      throw new Error(`Expected net COGS 1050, got ${pl.costOfGoodsSold.netCostOfGoodsSold}`);
    }
    if (pl.grossProfit !== 650) throw new Error(`Expected gross profit 650, got ${pl.grossProfit}`);
    if (pl.operatingExpenses.totalExpenses !== 250) {
      throw new Error(`Expected total expenses 250, got ${pl.operatingExpenses.totalExpenses}`);
    }
    if (pl.netOperatingProfit !== 400) throw new Error(`Expected net profit 400, got ${pl.netOperatingProfit}`);
    if (pl.currency !== 'ETB') throw new Error(`Expected currency ETB, got ${pl.currency}`);
  });

  await test('8. Cash Flow Statement: tracks actual inflows and outflows by payment method', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/financial/cash-flow?preset=this_month`, { headers: ownerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const cf = await res.json();

    // Total Inflows = 1300 Cash (800 + 500) + 200 Telebirr = 1500 ETB
    if (cf.inflows.totalInflows !== 1500) throw new Error(`Expected inflows 1500, got ${cf.inflows.totalInflows}`);
    if (cf.inflows.byMethod.cash !== 1300) throw new Error(`Expected cash inflows 1300, got ${cf.inflows.byMethod.cash}`);
    if (cf.inflows.byMethod.telebirr !== 200) throw new Error(`Expected telebirr inflows 200, got ${cf.inflows.byMethod.telebirr}`);

    // Outflows = 100 Telebirr refund + 250 Cash rent = 350 ETB
    if (cf.outflows.totalOutflows !== 350) throw new Error(`Expected outflows 350, got ${cf.outflows.totalOutflows}`);
    if (cf.outflows.refundsDisbursed !== 100) throw new Error(`Expected refundsDisbursed 100, got ${cf.outflows.refundsDisbursed}`);
    if (cf.outflows.operatingExpenses !== 250) throw new Error(`Expected expenses 250, got ${cf.outflows.operatingExpenses}`);

    // Net Cash Flow = 1500 - 350 = 1150 ETB
    if (cf.netCashFlow !== 1150) throw new Error(`Expected netCashFlow 1150, got ${cf.netCashFlow}`);
    // Physical cash net = 1300 in - 250 out = 1050 ETB
    if (cf.netPhysicalCashMovement !== 1050) throw new Error(`Expected physical cash 1050, got ${cf.netPhysicalCashMovement}`);
  });

  await test('9. Receivables Statement: lists outstanding unpaid balances & aging analysis', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/financial/receivables`, { headers: ownerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const recv = await res.json();

    if (recv.totalReceivables !== 300) throw new Error(`Expected totalReceivables 300, got ${recv.totalReceivables}`);
    if (recv.receivableCount < 1) throw new Error('Expected at least 1 receivable sale');
    if (recv.receivables[0].balanceDue !== 300) {
      throw new Error(`Expected balanceDue 300, got ${recv.receivables[0].balanceDue}`);
    }
  });

  await test('10. Tax Summary Report: Gross Output VAT less refunded VAT with compliance notice', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/financial/tax-summary?preset=this_month`, { headers: ownerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const tax = await res.json();

    if (tax.grossOutputVat === undefined || tax.netOutputVatAfterRefunds === undefined) {
      throw new Error('Missing grossOutputVat or netOutputVatAfterRefunds');
    }
    if (!tax.disclaimer || !tax.disclaimer.includes('official tax filings')) {
      throw new Error('Missing required official tax compliance disclaimer notice');
    }
  });

  // =========================================================================
  // 5. INVENTORY & VALUATION REPORTS
  // =========================================================================
  await test('11. Inventory Valuation: calculates stock on hand, cost valuation & retail potential', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/inventory/valuation`, { headers: ownerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const val = await res.json();

    if (val.totalProducts < 3) throw new Error(`Expected >= 3 products, got ${val.totalProducts}`);
    if (val.totalCostValuation <= 0) throw new Error(`Expected positive cost valuation, got ${val.totalCostValuation}`);
    if (val.totalRetailValuation <= val.totalCostValuation) {
      throw new Error('Total retail valuation should exceed wholesale cost valuation');
    }
    if (val.totalPotentialProfit <= 0) throw new Error('Expected positive potential profit in stock');
  });

  await test('12. Inventory Movements Ledger: paginates stock movement audit records', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/inventory/movements?page=1&limit=10`, { headers: invStaffHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const mov = await res.json();

    if (!Array.isArray(mov.items)) throw new Error('Expected items array');
    if (mov.items.length < 1) throw new Error('Expected at least 1 movement record');
    if (!mov.pagination) throw new Error('Missing pagination object');
  });

  await test('13. Product Performance Report: sales volume, revenue and stock level per product', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/inventory/product-performance?preset=this_month`, {
      headers: ownerHeaders,
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const perf = await res.json();

    if (!Array.isArray(perf.items)) throw new Error('Expected items array');
    const phone = perf.items.find((p: any) => p.sku === `PHONE-${ts}`);
    if (!phone) throw new Error('Missing Smartphone in product performance');
    if (phone.unitsSold !== 2) throw new Error(`Expected 2 phones sold, got ${phone.unitsSold}`);
    if (phone.grossRevenue !== 1600) throw new Error(`Expected 1600 phone revenue, got ${phone.grossRevenue}`);
  });

  // =========================================================================
  // 6. PURCHASE & EXPENSE REPORTS
  // =========================================================================
  await test('14. Purchase Reports: ordered value vs received value distinction and status breakdown', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/purchases/summary?preset=this_month`, { headers: managerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const poSummary = await res.json();

    if (poSummary.totalPurchases < 1) throw new Error('Expected at least 1 purchase order');
    if (poSummary.totalOrderedValue !== 5000) {
      throw new Error(`Expected totalOrderedValue 5000, got ${poSummary.totalOrderedValue}`);
    }
    // Strict rule: creation does NOT mark received
    if (poSummary.totalReceivedValue !== 0) {
      throw new Error(`Expected totalReceivedValue 0 for pending PO, got ${poSummary.totalReceivedValue}`);
    }
  });

  await test('15. Expenses Summary: breakdown by category and payment method', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/expenses/summary?preset=this_month`, { headers: managerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const exp = await res.json();

    if (exp.totalAmount !== 250) throw new Error(`Expected totalAmount 250, got ${exp.totalAmount}`);
    if (exp.byCategory[0].category !== 'Rent') throw new Error(`Expected Rent category, got ${exp.byCategory[0].category}`);
  });

  // =========================================================================
  // 7. STAFF PERFORMANCE REPORT
  // =========================================================================
  await test('16. Staff Performance: tracks transaction count, revenue and average ticket per cashier', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/staff/performance?preset=this_month`, { headers: managerHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const staff = await res.json();

    if (!Array.isArray(staff.items)) throw new Error('Expected items array');
    const cashierPerf = staff.items.find((s: any) => s.userId === cashierUserId);
    if (!cashierPerf) throw new Error('Cashier not found in staff performance');
    if (cashierPerf.salesCount !== 3) throw new Error(`Expected 3 sales for cashier, got ${cashierPerf.salesCount}`);
    if (cashierPerf.grossSales !== 1800) throw new Error(`Expected 1800 gross sales, got ${cashierPerf.grossSales}`);
    if (cashierPerf.returnCount !== 1) throw new Error(`Expected 1 return, got ${cashierPerf.returnCount}`);
    if (cashierPerf.netSales !== 1700) throw new Error(`Expected 1700 net sales, got ${cashierPerf.netSales}`);
  });

  // =========================================================================
  // 8. SECURE CSV EXPORTS & FORMULA INJECTION PREVENTION
  // =========================================================================
  await test('17. CSV Export Security: escapes formula injection (=, +, -, @) with single quote', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=inventory_valuation`, {
      headers: ownerHeaders,
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const csvText = await res.text();

    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('text/csv')) throw new Error(`Expected text/csv content type, got ${contentType}`);

    // Product 2 was named: "Charger =cmd|' /C calc'!A0 ..."
    // Formula injection defense must escape the '=' by prepending single quote "'"
    if (!csvText.includes("'=cmd")) {
      throw new Error(`Formula injection not escaped! CSV snippet: ${csvText.slice(0, 500)}`);
    }
  });

  await test('18. CSV Export RBAC: Cashier & Manager blocked from exporting sensitive financial P&L CSV', async () => {
    const cashRes = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=profit_loss`, {
      headers: cashierHeaders,
    });
    if (cashRes.status !== 403) throw new Error(`Expected 403 for cashier on P&L export, got ${cashRes.status}`);

    const mgrRes = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=profit_loss`, {
      headers: managerHeaders,
    });
    if (mgrRes.status !== 403) throw new Error(`Expected 403 for manager on P&L export, got ${mgrRes.status}`);
  });

  // =========================================================================
  // 6. PHASE 4 AUDIT DEFECT REMEDIATION REGRESSION TESTS (19 - 26)
  // =========================================================================

  await test('19. Defect 1 Regression: Unpaid Sale Return correctly reverses VAT via returnCredit', async () => {
    // Create an unpaid sale: Total 1,150 ETB (Tax 150 ETB, Subtotal 1,000 ETB, Payments: 0)
    const unpaidSale = await prisma.sale.create({
      data: {
        organizationId: orgId,
        cashierUserId,
        receiptNumber: `REC-UNPAID-${ts}`,
        subtotal: 1000,
        discountAmount: 0,
        taxAmount: 150,
        totalAmount: 1150,
        status: SaleStatus.COMPLETED,
        createdAt: new Date(),
      },
    });

    // Return the unpaid goods: returnCredit = 1150, refundDisbursed = 0, unpaidCancelled = 1150, refundAmount = 0
    await prisma.saleReturn.create({
      data: {
        organizationId: orgId,
        saleId: unpaidSale.id,
        returnNumber: `RET-UNPAID-${ts}`,
        cashierUserId,
        returnCredit: 1150,
        refundDisbursed: 0,
        unpaidCancelled: 1150,
        customerCreditDisbursed: 0,
        refundAmount: 0, // No cash disbursed to customer!
        status: ReturnStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    const res = await fetch(`${serverUrl}/api/v1/reports/financial/tax-summary?preset=this_month`, {
      headers: ownerHeaders,
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const tax = await res.json();

    // The VAT on the unpaid return MUST be adjusted using returnCredit (1150 * 150 / 1150 = 150 ETB)
    // If bug was present, refundAmount was 0, so refundedOutputVat was 0.
    if (tax.refundedOutputVat <= 0) {
      throw new Error(`Expected refundedOutputVat > 0 for unpaid return, got ${tax.refundedOutputVat}`);
    }
  });

  await test('20. Defect 1 Regression: Return with overpayment credit payout does NOT over-adjust VAT', async () => {
    // Create sale: Total 1150 ETB (Tax 150 ETB)
    const overpaidSale = await prisma.sale.create({
      data: {
        organizationId: orgId,
        cashierUserId,
        receiptNumber: `REC-OVERPAID-${ts}`,
        subtotal: 1000,
        discountAmount: 0,
        taxAmount: 150,
        totalAmount: 1150,
        status: SaleStatus.COMPLETED,
        createdAt: new Date(),
      },
    });

    // Return: merchandise return credit = 575 ETB, customer credit payout = 50 ETB, refundAmount = 625 ETB
    await prisma.saleReturn.create({
      data: {
        organizationId: orgId,
        saleId: overpaidSale.id,
        returnNumber: `RET-OVERPAID-${ts}`,
        cashierUserId,
        returnCredit: 575,
        refundDisbursed: 575,
        customerCreditDisbursed: 50,
        unpaidCancelled: 0,
        refundAmount: 625, // Includes the 50 ETB overpayment cash settlement
        status: ReturnStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    const res = await fetch(`${serverUrl}/api/v1/reports/financial/tax-summary?preset=this_month`, {
      headers: ownerHeaders,
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
  });

  await test('21. Defect 2 Regression: Receivables count and amount agree after full return', async () => {
    // Create partially paid sale: 1000 ETB, customer paid 600 ETB, 400 ETB unpaid
    const partSale = await prisma.sale.create({
      data: {
        organizationId: orgId,
        cashierUserId,
        receiptNumber: `REC-PART-${ts}`,
        subtotal: 1000,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1000,
        status: SaleStatus.COMPLETED,
        createdAt: new Date(),
        payments: {
          create: [{ method: PaymentMethod.CASH, amount: 600, createdAt: new Date() }],
        },
      },
    });

    // Return the remaining 400 ETB unpaid merchandise:
    // returnCredit = 400, unpaidCancelled = 400, refundDisbursed = 0 -> balanceDue = 0!
    await prisma.saleReturn.create({
      data: {
        organizationId: orgId,
        saleId: partSale.id,
        returnNumber: `RET-PART-${ts}`,
        cashierUserId,
        returnCredit: 400,
        refundDisbursed: 0,
        unpaidCancelled: 400,
        refundAmount: 0,
        status: ReturnStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    // Verify receivables report
    const recvRes = await fetch(`${serverUrl}/api/v1/reports/financial/receivables`, {
      headers: ownerHeaders,
    });
    const recvData = await recvRes.json();
    const hasPartSaleInReceivables = recvData.receivables.some((r: any) => r.id === partSale.id);
    if (hasPartSaleInReceivables) {
      throw new Error(`Partially paid sale settled by return should have balanceDue 0 and not be in receivables list`);
    }
  });

  await test('22. Defect 3 Regression: THIS_WEEK honors Africa/Addis_Ababa when UTC server is on Sunday', async () => {
    // Simulated UTC time: Sunday 2026-11-15 at 22:30:00Z
    // In Africa/Addis_Ababa (UTC+3), this is Monday 2026-11-16 at 01:30:00 AM!
    const utcSundayRef = new Date('2026-11-15T22:30:00.000Z');
    const result = resolveDatePreset(DatePreset.THIS_WEEK, 'Africa/Addis_Ababa', undefined, undefined, utcSundayRef);

    // Monday in Addis Ababa starts at 2026-11-15T21:00:00.000Z (00:00 EAT on Nov 16)
    const expectedMondayStartUtc = new Date('2026-11-15T21:00:00.000Z');
    if (result.currentStart.getTime() !== expectedMondayStartUtc.getTime()) {
      throw new Error(`Expected thisWeekStart ${expectedMondayStartUtc.toISOString()}, got ${result.currentStart.toISOString()}`);
    }
  });

  await test('23. Defect 4 Regression: Custom date filter includes midnight-to-03:00 transactions in Addis Ababa', async () => {
    // 00:30 on Nov 1, 2026 in Africa/Addis_Ababa is 2026-10-31T21:30:00.000Z in UTC
    await prisma.sale.create({
      data: {
        organizationId: orgId,
        cashierUserId,
        receiptNumber: `REC-MIDNIGHT-${ts}`,
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        status: SaleStatus.COMPLETED,
        createdAt: new Date('2026-10-31T21:30:00.000Z'), // 00:30 AM Nov 1 Addis time
      },
    });

    const res = await fetch(`${serverUrl}/api/v1/reports/sales/summary?preset=custom&startDate=2026-11-01&endDate=2026-11-01`, {
      headers: ownerHeaders,
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const summary = await res.json();

    if (summary.totalTransactions < 1 || summary.grossSales < 500) {
      throw new Error(`Expected midnight sale to be included in custom 2026-11-01 filter. Got grossSales: ${summary.grossSales}, count: ${summary.totalTransactions}`);
    }
  });

  await test('24. Defect 5 Regression: Receivables CSV Export downloads sanitized ledger data', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=receivables`, {
      headers: ownerHeaders,
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('text/csv')) throw new Error(`Expected text/csv, got ${contentType}`);

    const csvText = await res.text();
    if (!csvText.includes('Receipt Number') || !csvText.includes('Balance Due')) {
      throw new Error(`Expected Receivables CSV headers, got: ${csvText.slice(0, 200)}`);
    }
  });

  await test('25. Defect 5 Regression: Tax Summary CSV Export downloads VAT reconciliation data', async () => {
    const res = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=tax_summary`, {
      headers: ownerHeaders,
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('text/csv')) throw new Error(`Expected text/csv, got ${contentType}`);

    const csvText = await res.text();
    if (!csvText.includes('Gross Output VAT Invoiced') || !csvText.includes('Net Output VAT After Returns')) {
      throw new Error(`Expected Tax Summary CSV headers, got: ${csvText.slice(0, 200)}`);
    }
  });

  await test('26. Defect 5 Regression: Unauthorized CSV Access blocked for Manager & Cashier on Receivables & Tax', async () => {
    // 1. Manager blocked on Receivables & Tax Summary CSV
    const mgrRecv = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=receivables`, { headers: managerHeaders });
    if (mgrRecv.status !== 403) throw new Error(`Expected 403 for manager on receivables CSV, got ${mgrRecv.status}`);

    const mgrTax = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=tax_summary`, { headers: managerHeaders });
    if (mgrTax.status !== 403) throw new Error(`Expected 403 for manager on tax_summary CSV, got ${mgrTax.status}`);

    // 2. Cashier blocked on Receivables & Tax Summary CSV
    const cashRecv = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=receivables`, { headers: cashierHeaders });
    if (cashRecv.status !== 403) throw new Error(`Expected 403 for cashier on receivables CSV, got ${cashRecv.status}`);

    const cashTax = await fetch(`${serverUrl}/api/v1/reports/export/csv?reportType=tax_summary`, { headers: cashierHeaders });
    if (cashTax.status !== 403) throw new Error(`Expected 403 for cashier on tax_summary CSV, got ${cashTax.status}`);
  });

  console.log('\n========================================================================');
  console.log(`  PHASE 4 VERIFICATION RESULTS: ${passedTests}/26 PASSED (${failedTests} FAILED)`);
  console.log('========================================================================\n');

  await app.close();

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Fatal Phase 4 test runner error:', err);
  process.exit(1);
});
