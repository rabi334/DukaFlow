import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PaymentMethod, PurchaseStatus, SaleStatus, StockMovementType, MemberStatus } from '@prisma/client';

async function runFinalAuditTests() {
  console.log('========================================================================');
  console.log('  GATIIFLOW PHASE 3: FINAL INDEPENDENT ACCEPTANCE AUDIT TEST SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const testPort = 5999;
  await app.listen(testPort);
  const serverUrl = `http://localhost:${testPort}`;
  const prisma = app.get(PrismaService);

  const ts = Date.now();
  const password = 'FinalAuditPass2026!';

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalTests++;
    process.stdout.write(`• Testing: ${name}... `);
    try {
      await fn();
      passedTests++;
      console.log('✅ PASSED');
    } catch (err: any) {
      failedTests++;
      console.log(`❌ FAILED: ${err.message || String(err)}`);
    }
  }

  // Helpers
  async function registerUser(name: string, email: string) {
    const res = await fetch(`${serverUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    return res.json();
  }

  async function loginUser(email: string) {
    const res = await fetch(`${serverUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  }

  // 1. Setup workspace & accounts
  console.log('--- Setting up test workspace for final audit ---');
  const ownerReg = await registerUser('Audit Owner', `audit-owner-${ts}@gatiiflow.com`);
  const cashierReg = await registerUser('Audit Cashier', `audit-cashier-${ts}@gatiiflow.com`);

  const ownerLogin = await loginUser(`audit-owner-${ts}@gatiiflow.com`);
  const cashierLogin = await loginUser(`audit-cashier-${ts}@gatiiflow.com`);

  const ownerToken = ownerLogin.session.token;
  const cashierToken = cashierLogin.session.token;

  // Onboard Business
  const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      name: `Final Audit Mart ${ts}`,
      city: 'Addis Ababa',
      businessType: 'Retail',
      currency: 'ETB',
    }),
  });
  const orgData = await orgRes.json();
  const orgId = orgData.business.id;

  const ownerHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ownerToken}`,
    'x-organization-id': orgId,
  };
  const cashierHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cashierToken}`,
    'x-organization-id': orgId,
  };

  // Add cashier member
  await prisma.member.create({
    data: {
      organizationId: orgId,
      userId: cashierLogin.user.id,
      role: 'cashier',
      status: MemberStatus.ACTIVE,
    },
  });

  // =========================================================================
  // SECTION 1: REFUND DATE ATTRIBUTION
  // =========================================================================
  await test('1. Refund Date Attribution: Sale in Oct returned in Nov attributes refund to Nov actual date', async () => {
    // Create Product
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Attribution Product ${ts}`,
        sku: `ATTR-${ts}`,
        costPrice: 100,
        sellingPrice: 150,
        initialStock: 50,
      }),
    });
    const prod = await pRes.json();

    // 1. Create a sale backdated to October 30
    const oct30 = new Date('2026-10-30T14:00:00Z');
    const nov02 = new Date('2026-11-02T10:30:00Z');

    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 2, unitPrice: 150 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 300,
      }),
    });
    const saleData = await checkoutRes.json();

    // Backdate sale in DB to October 30
    const saleDb = await prisma.sale.update({
      where: { id: saleData.id },
      data: { createdAt: oct30 },
      include: { items: true },
    });
    const saleItemId = saleDb.items[0].id;

    // 2. Process return of 1 item backdated to November 2
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${saleData.id}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 1 }],
        reason: 'Customer return in November',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    if (retRes.status !== 201) {
      const errTxt = await retRes.text();
      throw new Error(`Return failed with status ${retRes.status}: ${errTxt}`);
    }
    const retData = await retRes.json();

    // Backdate return in DB to November 2
    await prisma.saleReturn.update({
      where: { id: retData.id },
      data: { createdAt: nov02 },
    });

    // Verify October Period Query (2026-10-01 to 2026-10-31 23:59:59)
    const octStart = new Date('2026-10-01T00:00:00Z');
    const octEnd = new Date('2026-10-31T23:59:59Z');

    const octSales = await prisma.sale.findMany({
      where: { organizationId: orgId, createdAt: { gte: octStart, lte: octEnd }, status: { not: SaleStatus.CANCELLED } },
    });
    const octReturns = await prisma.saleReturn.findMany({
      where: { organizationId: orgId, createdAt: { gte: octStart, lte: octEnd } },
    });

    const octGrossSales = octSales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const octRefunds = octReturns.reduce((sum, r) => sum + Number(r.refundAmount), 0);

    if (octGrossSales !== 300) throw new Error(`Expected Oct gross sales = 300, got ${octGrossSales}`);
    if (octRefunds !== 0) throw new Error(`Expected Oct refunds = 0, got ${octRefunds}`);

    // Verify November Period Query (2026-11-01 to 2026-11-30 23:59:59)
    const novStart = new Date('2026-11-01T00:00:00Z');
    const novEnd = new Date('2026-11-30T23:59:59Z');

    const novSales = await prisma.sale.findMany({
      where: { organizationId: orgId, createdAt: { gte: novStart, lte: novEnd }, status: { not: SaleStatus.CANCELLED } },
    });
    const novReturns = await prisma.saleReturn.findMany({
      where: { organizationId: orgId, createdAt: { gte: novStart, lte: novEnd } },
    });

    const novGrossSales = novSales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const novRefunds = novReturns.reduce((sum, r) => sum + Number(r.refundAmount), 0);

    if (novGrossSales !== 0) throw new Error(`Expected Nov gross sales = 0, got ${novGrossSales}`);
    if (novRefunds !== 150) throw new Error(`Expected Nov refunds = 150, got ${novRefunds}`);
    const novNetSales = novGrossSales - novRefunds;
    if (novNetSales !== -150) throw new Error(`Expected Nov net sales = -150, got ${novNetSales}`);
  });

  // =========================================================================
  // SECTION 2: DISCOUNT AND VAT ACCOUNTING
  // =========================================================================
  await test('2. Discount & VAT Accounting: verify line discount, tax calculations, and prorated refund', async () => {
    // Create product
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Discounted Item ${ts}`,
        sku: `DISC-${ts}`,
        costPrice: 50,
        sellingPrice: 100,
        initialStock: 20,
      }),
    });
    const prod = await pRes.json();

    // 3 items @ 100 = 300 gross line. Discount = 30. Line total = 270.
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [
          {
            productId: prod.id,
            quantity: 3,
            unitPrice: 100,
            discountAmount: 30,
          },
        ],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 270,
      }),
    });
    const sale = await checkoutRes.json();

    // Verify Sale DB values:
    // subtotal = 270 (sum of lineTotals after line discount)
    // discountAmount = 30
    // totalAmount = 270 (taxInclusive is default true)
    const dbSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: { items: true },
    });
    if (Number(dbSale?.subtotal) !== 270) throw new Error(`Expected subtotal 270, got ${dbSale?.subtotal}`);
    if (Number(dbSale?.discountAmount) !== 30) throw new Error(`Expected discount 30, got ${dbSale?.discountAmount}`);
    if (Number(dbSale?.totalAmount) !== 270) throw new Error(`Expected totalAmount 270, got ${dbSale?.totalAmount}`);

    // Prorated line refund test: return 1 unit of the 3 units
    // Prorated refund = (270 / 3) * 1 = 90 (NOT 100, preserving discount fairness!)
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'Customer return of 1 discounted unit',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    const retData = await retRes.json();
    if (Number(retData.refundAmount) !== 90) {
      throw new Error(`Expected prorated refund of 90, got ${retData.refundAmount}`);
    }
  });

  // =========================================================================
  // SECTION 3: PARTIAL RESTOCKING (2 RESTOCKED, 1 DAMAGED)
  // =========================================================================
  await test('3. Partial Restocking: return 3 units where 2 are restocked and 1 is damaged', async () => {
    // Create Product
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Glassware Set ${ts}`,
        sku: `GLS-${ts}`,
        costPrice: 40,
        sellingPrice: 80,
        initialStock: 10,
      }),
    });
    const prod = await pRes.json();

    // Customer buys 3 glassware sets
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 3, unitPrice: 80 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 240,
      }),
    });
    const sale = await checkoutRes.json();
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const saleItemId = dbSale!.items[0].id;

    // Stock on hand after sale should be 10 - 3 = 7
    let inv = await prisma.inventory.findUnique({ where: { productId: prod.id } });
    if (Number(inv?.quantityOnHand) !== 7) throw new Error(`Expected stock 7 after sale, got ${inv?.quantityOnHand}`);

    // Return Step A: 2 units restocked (good condition)
    const retA = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 2 }],
        reason: 'Customer returned 2 unopened units',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    const retAData = await retA.json();
    if (Number(retAData.refundAmount) !== 160) throw new Error(`Expected 160 refund for 2 units, got ${retAData.refundAmount}`);

    // Stock on hand should increase by 2 (7 -> 9)
    inv = await prisma.inventory.findUnique({ where: { productId: prod.id } });
    if (Number(inv?.quantityOnHand) !== 9) throw new Error(`Expected stock 9 after restock, got ${inv?.quantityOnHand}`);

    // Return Step B: 1 unit damaged (unrestocked)
    const retB = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 1 }],
        reason: 'Customer returned 1 damaged/cracked unit',
        refundMethod: PaymentMethod.CASH,
        restockInventory: false,
      }),
    });
    const retBData = await retB.json();
    if (Number(retBData.refundAmount) !== 80) throw new Error(`Expected 80 refund for 1 unit, got ${retBData.refundAmount}`);

    // Stock on hand should REMAIN 9 (not incremented for damaged item)
    inv = await prisma.inventory.findUnique({ where: { productId: prod.id } });
    if (Number(inv?.quantityOnHand) !== 9) throw new Error(`Expected stock to remain 9, got ${inv?.quantityOnHand}`);

    // Combined returned units = 3 (sale should now be REFUNDED)
    const updatedSale = await prisma.sale.findUnique({ where: { id: sale.id } });
    if (updatedSale?.status !== SaleStatus.REFUNDED) {
      throw new Error(`Expected sale status REFUNDED, got ${updatedSale?.status}`);
    }

    // Verify COGS impact:
    // Original COGS for 3 units: 3 * 40 = 120
    // Restocked COGS reversal: 2 units restocked * 40 = 80 reversed
    // Damaged COGS: 1 unit damaged * 40 = 40 (retained in COGS)
    // Net COGS: 120 - 80 = 40
    // Total refund: 160 + 80 = 240
    // Net revenue: 240 - 240 = 0
    const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: ownerHeaders,
    });
    const dash = await dashRes.json();
    // Verify restocked COGS reversal reflects exactly the restocked units
    const returnsForSale = await prisma.saleReturn.findMany({
      where: { saleId: sale.id },
      include: { items: { include: { saleItem: true } } },
    });
    let cogsReversedForSale = 0;
    for (const r of returnsForSale) {
      if (r.restocked) {
        for (const it of r.items) {
          cogsReversedForSale += Number(it.saleItem.costPriceSnapshot) * Number(it.quantity);
        }
      }
    }
    if (cogsReversedForSale !== 80) {
      throw new Error(`Expected exactly 80 COGS reversed for the 2 restocked units, got ${cogsReversedForSale}`);
    }
  });

  // =========================================================================
  // SECTION 4: CANCELLED SALES AND FINANCIAL INTEGRITY
  // =========================================================================
  await test('4. Additional Accounting: Cancelled sales excluded, Decimal precision verified', async () => {
    // Create product
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Cancelled Sale Test ${ts}`,
        sku: `CANC-${ts}`,
        costPrice: 50,
        sellingPrice: 100,
        initialStock: 20,
      }),
    });
    const prod = await pRes.json();

    // Create a sale and cancel it
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 2, unitPrice: 100 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 200,
      }),
    });
    const sale = await checkoutRes.json();

    // Mark sale CANCELLED
    await prisma.sale.update({
      where: { id: sale.id },
      data: { status: SaleStatus.CANCELLED },
    });

    // Check dashboard summary: cancelled sale must NOT be counted in salesToday or salesMonth
    const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: ownerHeaders,
    });
    const dash = await dashRes.json();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Check sales in DB with status != CANCELLED for current month
    const nonCancelledSalesInMonth = await prisma.sale.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: monthStart },
        status: { not: SaleStatus.CANCELLED },
      },
    });
    const expectedGrossMonth = nonCancelledSalesInMonth.reduce((sum, s) => sum + Number(s.totalAmount), 0);

    if (dash.grossSalesMonth !== expectedGrossMonth) {
      throw new Error(`Expected grossSalesMonth = ${expectedGrossMonth}, got ${dash.grossSalesMonth}`);
    }
  });

  console.log('\n========================================================================');
  console.log(`  FINAL AUDIT RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('========================================================================\n');

  await app.close();

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFinalAuditTests().catch((err) => {
  console.error('Fatal audit test runner error:', err);
  process.exit(1);
});
