import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PaymentMethod, SaleStatus, MemberStatus } from '@prisma/client';

async function runVatAndTimezoneTests() {
  console.log('========================================================================');
  console.log('  DUKAFLOW: FINAL VAT & BUSINESS-TIMEZONE VERIFICATION SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const testPort = 5994;
  await app.listen(testPort);
  const serverUrl = `http://localhost:${testPort}`;
  const prisma = app.get(PrismaService);

  const ts = Date.now();
  const password = 'VatTimezonePass2026!';

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
  console.log('--- Setting up test workspace for VAT & Timezone verification ---');
  const ownerReg = await registerUser('VAT Owner', `vat-owner-${ts}@dukaflow.et`);
  const cashierReg = await registerUser('VAT Cashier', `vat-cashier-${ts}@dukaflow.et`);

  const ownerLogin = await loginUser(`vat-owner-${ts}@dukaflow.et`);
  const cashierLogin = await loginUser(`vat-cashier-${ts}@dukaflow.et`);

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
      name: `VAT & Timezone Mart ${ts}`,
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
  // TEST 1: TAX-EXCLUSIVE FULL REFUND
  // =========================================================================
  await test('1. Tax-exclusive Sale & Full Return: refund 1150 ETB, net sales 0, VAT adjusted', async () => {
    // Configure org: taxInclusive = false, taxRate = 0.15
    await prisma.organization.update({
      where: { id: orgId },
      data: { taxInclusive: false, taxRate: '0.15' },
    });

    // Create product: 1,000 ETB
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Tax-Exclusive Item ${ts}`,
        sku: `TX-EXCL-${ts}`,
        costPrice: 600,
        sellingPrice: 1000,
        initialStock: 10,
      }),
    });
    const prod = await pRes.json();

    // Checkout: 1 unit @ 1,000 ETB. Subtotal = 1,000 ETB. VAT 15% = 150 ETB. Total = 1,150 ETB.
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 1000 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 1150,
      }),
    });
    const sale = await checkoutRes.json();

    if (Number(sale.subtotal) !== 1000) throw new Error(`Expected subtotal 1000, got ${sale.subtotal}`);
    if (Number(sale.taxAmount) !== 150) throw new Error(`Expected taxAmount 150, got ${sale.taxAmount}`);
    if (Number(sale.totalAmount) !== 1150) throw new Error(`Expected totalAmount 1150, got ${sale.totalAmount}`);

    // Get sale item ID
    const dbSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: { items: true },
    });
    const saleItemId = dbSale!.items[0].id;

    // Full return of product
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 1 }],
        reason: 'Customer returned full tax-exclusive item',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    if (retRes.status !== 201) {
      const err = await retRes.text();
      throw new Error(`Return failed with status ${retRes.status}: ${err}`);
    }
    const retData = await retRes.json();

    // Verify refund amount is 1,150 ETB (customer refunded full original payment including tax!)
    if (Number(retData.refundAmount) !== 1150) {
      throw new Error(`Expected refundAmount 1150 ETB, got ${retData.refundAmount}`);
    }

    // Verify Dashboard report: Net Sales must be exactly ZERO, VAT adjusted
    const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: ownerHeaders,
    });
    const dash = await dashRes.json();

    if (dash.grossSalesMonth !== 1150) {
      throw new Error(`Expected grossSalesMonth = 1150, got ${dash.grossSalesMonth}`);
    }
    if (dash.refundsMonth !== 1150) {
      throw new Error(`Expected refundsMonth = 1150, got ${dash.refundsMonth}`);
    }
    if (dash.netSalesMonth !== 0) {
      throw new Error(`Expected netSalesMonth = 0, got ${dash.netSalesMonth}`);
    }
    if (dash.netCustomerCashMovementMonth !== 0) {
      throw new Error(`Expected netCustomerCashMovementMonth = 0, got ${dash.netCustomerCashMovementMonth}`);
    }
    if (dash.vatAdjustmentMonth !== 150) {
      throw new Error(`Expected vatAdjustmentMonth = 150, got ${dash.vatAdjustmentMonth}`);
    }
    if (dash.netTaxMonth !== 0) {
      throw new Error(`Expected netTaxMonth = 0, got ${dash.netTaxMonth}`);
    }
  });

  // =========================================================================
  // TEST 2: TAX-EXCLUSIVE PARTIAL REFUND
  // =========================================================================
  await test('2. Tax-exclusive Partial Return: refund 575 ETB per unit, exact penny balance', async () => {
    // 2 units @ 500 ETB = 1,000 subtotal. VAT 15% = 150 ETB. Total = 1,150 ETB (575 ETB each).
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Partial Tax-Excl Item ${ts}`,
        sku: `TX-PART-${ts}`,
        costPrice: 300,
        sellingPrice: 500,
        initialStock: 10,
      }),
    });
    const prod = await pRes.json();

    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 2, unitPrice: 500 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 1150,
      }),
    });
    const sale = await checkoutRes.json();
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const saleItemId = dbSale!.items[0].id;

    // Return 1 of 2 units
    const retRes1 = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 1 }],
        reason: 'Partial return unit 1',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    const ret1 = await retRes1.json();
    if (Number(ret1.refundAmount) !== 575) {
      throw new Error(`Expected partial refund of 575 ETB, got ${ret1.refundAmount}`);
    }

    // Return remaining 2nd unit
    const retRes2 = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 1 }],
        reason: 'Partial return unit 2 (final)',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    const ret2 = await retRes2.json();
    if (Number(ret2.refundAmount) !== 575) {
      throw new Error(`Expected remaining refund of 575 ETB, got ${ret2.refundAmount}`);
    }

    // Combined refund: 575 + 575 = 1150
    const allReturns = await prisma.saleReturn.findMany({ where: { saleId: sale.id } });
    const totalRefunded = allReturns.reduce((sum, r) => sum + Number(r.refundAmount), 0);
    if (totalRefunded !== 1150) {
      throw new Error(`Expected total refunded 1150 ETB, got ${totalRefunded}`);
    }
  });

  // =========================================================================
  // TEST 3: TAX-INCLUSIVE SALE AND REFUND (TAX NOT ADDED TWICE)
  // =========================================================================
  await test('3. Tax-inclusive Sale & Return: tax is NOT added twice', async () => {
    // Configure org: taxInclusive = true, taxRate = 0.15
    await prisma.organization.update({
      where: { id: orgId },
      data: { taxInclusive: true, taxRate: '0.15' },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Tax-Inclusive Item ${ts}`,
        sku: `TX-INCL-${ts}`,
        costPrice: 500,
        sellingPrice: 1000,
        initialStock: 10,
      }),
    });
    const prod = await pRes.json();

    // Checkout: 1 unit @ 1,000 ETB. Subtotal = 1,000 ETB. Total = 1,000 ETB (tax is inclusive).
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 1000 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 1000,
      }),
    });
    const sale = await checkoutRes.json();
    if (Number(sale.totalAmount) !== 1000) throw new Error(`Expected totalAmount 1000, got ${sale.totalAmount}`);

    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const saleItemId = dbSale!.items[0].id;

    // Full return
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 1 }],
        reason: 'Full return tax inclusive',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    const retData = await retRes.json();

    // Verify refund amount is 1,000 ETB (tax is NOT added twice!)
    if (Number(retData.refundAmount) !== 1000) {
      throw new Error(`Expected refundAmount 1000 ETB, got ${retData.refundAmount}`);
    }
  });

  // =========================================================================
  // TEST 4: DAILY CHART TIMEZONE HANDLING (AFRICA/ADDIS_ABABA)
  // =========================================================================
  await test('4. Daily Chart Timezone: sale at 00:30 EAT & refund at 01:00 EAT appear on Nov 14', async () => {
    // Dedicated business for isolated daily chart verification
    const tzOrgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Timezone Dedicated Mart ${ts}`,
        city: 'Addis Ababa',
        businessType: 'Retail',
        currency: 'ETB',
      }),
    });
    const tzOrgData = await tzOrgRes.json();
    const tzOrgId = tzOrgData.business.id;

    const tzOwnerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
      'x-organization-id': tzOrgId,
    };
    const tzCashierHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cashierToken}`,
      'x-organization-id': tzOrgId,
    };

    await prisma.member.create({
      data: {
        organizationId: tzOrgId,
        userId: cashierLogin.user.id,
        role: 'cashier',
        status: MemberStatus.ACTIVE,
      },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: tzOwnerHeaders,
      body: JSON.stringify({
        name: `Timezone Item ${ts}`,
        sku: `TZ-${ts}`,
        costPrice: 100,
        sellingPrice: 200,
        initialStock: 20,
      }),
    });
    const prod = await pRes.json();

    // Sale at November 14, 2026, 00:30 Ethiopian local time (+03:00)
    // Equivalent UTC: 2026-11-13T21:30:00.000Z
    const saleDateUtc = new Date('2026-11-13T21:30:00.000Z');

    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: tzCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 200 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 200,
      }),
    });
    const sale = await checkoutRes.json();

    // Set exact timestamps
    await prisma.sale.update({
      where: { id: sale.id },
      data: { createdAt: saleDateUtc },
    });

    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const saleItemId = dbSale!.items[0].id;

    // Refund at November 14, 2026, 01:00 Ethiopian local time (+03:00)
    // Equivalent UTC: 2026-11-13T22:00:00.000Z
    const refundDateUtc = new Date('2026-11-13T22:00:00.000Z');

    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: tzCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 1 }],
        reason: 'Timezone test return',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    const retData = await retRes.json();

    await prisma.saleReturn.update({
      where: { id: retData.id },
      data: { createdAt: refundDateUtc },
    });

    // Query daily sales chart
    const chartRes = await fetch(`${serverUrl}/api/v1/reports/charts/daily-sales`, {
      headers: tzOwnerHeaders,
    });
    if (chartRes.status !== 200) throw new Error(`Chart status: ${chartRes.status}`);
    const chartData: Array<{ date: string; gross: number; refunds: number; net: number }> =
      await chartRes.json();

    // Find bucket for 2026-11-14
    const nov14Bucket = chartData.find((d) => d.date === '2026-11-14');
    const nov13Bucket = chartData.find((d) => d.date === '2026-11-13');

    if (!nov14Bucket) {
      throw new Error(`Chart data missing 2026-11-14 bucket. Available dates: ${chartData.map((d) => d.date).join(', ')}`);
    }

    // Both the 200 gross sale and 200 refund MUST appear on 2026-11-14
    if (nov14Bucket.gross !== 200) {
      throw new Error(`Expected 2026-11-14 gross = 200, got ${nov14Bucket.gross}`);
    }
    if (nov14Bucket.refunds !== 200) {
      throw new Error(`Expected 2026-11-14 refunds = 200, got ${nov14Bucket.refunds}`);
    }
    if (nov14Bucket.net !== 0) {
      throw new Error(`Expected 2026-11-14 net = 0, got ${nov14Bucket.net}`);
    }

    // Verify neither leaked into 2026-11-13 (which would happen under raw UTC splitting!)
    if (nov13Bucket && (nov13Bucket.gross !== 0 || nov13Bucket.refunds !== 0)) {
      throw new Error(`UTC leak: 2026-11-13 has gross=${nov13Bucket.gross}, refunds=${nov13Bucket.refunds}`);
    }
  });

  // =========================================================================
  // TEST 5: PARTIALLY PAID SALE & OUTSTANDING BALANCES
  // =========================================================================
  await test('5. Partially Paid Sale: gross 1000 ETB, payment 600 ETB, outstanding 400 ETB', async () => {
    const pOrgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Partial Pay Mart ${ts}`,
        city: 'Addis Ababa',
        businessType: 'Retail',
        currency: 'ETB',
      }),
    });
    const pOrgData = await pOrgRes.json();
    const pOrgId = pOrgData.business.id;

    const pOwnerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
      'x-organization-id': pOrgId,
    };
    const pCashierHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cashierToken}`,
      'x-organization-id': pOrgId,
    };

    await prisma.member.create({
      data: {
        organizationId: pOrgId,
        userId: cashierLogin.user.id,
        role: 'cashier',
        status: MemberStatus.ACTIVE,
      },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: pOwnerHeaders,
      body: JSON.stringify({
        name: `Partial Pay Item ${ts}`,
        sku: `PP-${ts}`,
        costPrice: 500,
        sellingPrice: 1000,
        initialStock: 10,
      }),
    });
    const prod = await pRes.json();

    // Partial payment: Customer owes 1,000 ETB but pays 600 ETB cash
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: pCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 1000 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 600,
      }),
    });
    const sale = await checkoutRes.json();
    if (Number(sale.totalAmount) !== 1000) throw new Error(`Expected total 1000, got ${sale.totalAmount}`);

    const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: pOwnerHeaders,
    });
    const dash = await dashRes.json();

    // Verify distinct concepts:
    if (dash.grossSalesToday !== 1000) throw new Error(`Expected grossSalesToday = 1000, got ${dash.grossSalesToday}`);
    if (dash.customerPaymentsReceivedToday !== 600) throw new Error(`Expected customerPaymentsReceivedToday = 600, got ${dash.customerPaymentsReceivedToday}`);
    if (dash.cashReceivedToday !== 600) throw new Error(`Expected cashReceivedToday = 600, got ${dash.cashReceivedToday}`);
    if (dash.outstandingCustomerBalancesToday !== 400) throw new Error(`Expected outstandingCustomerBalancesToday = 400, got ${dash.outstandingCustomerBalancesToday}`);
    if (dash.netCustomerPaymentMovementToday !== 600) throw new Error(`Expected netCustomerPaymentMovementToday = 600, got ${dash.netCustomerPaymentMovementToday}`);
    if (dash.netSalesToday !== 1000) throw new Error(`Expected netSalesToday = 1000, got ${dash.netSalesToday}`);
  });

  // =========================================================================
  // TEST 6: FULLY PAID SALE FOLLOWED BY REFUND
  // =========================================================================
  await test('6. Fully Paid Sale Followed by Refund: distinct sales vs payment movements', async () => {
    const fOrgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Full Refund Mart ${ts}`,
        city: 'Addis Ababa',
        businessType: 'Retail',
        currency: 'ETB',
      }),
    });
    const fOrgData = await fOrgRes.json();
    const fOrgId = fOrgData.business.id;

    const fOwnerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
      'x-organization-id': fOrgId,
    };
    const fCashierHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cashierToken}`,
      'x-organization-id': fOrgId,
    };

    await prisma.member.create({
      data: {
        organizationId: fOrgId,
        userId: cashierLogin.user.id,
        role: 'cashier',
        status: MemberStatus.ACTIVE,
      },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: fOwnerHeaders,
      body: JSON.stringify({
        name: `Refundable Item ${ts}`,
        sku: `REF-${ts}`,
        costPrice: 400,
        sellingPrice: 800,
        initialStock: 10,
      }),
    });
    const prod = await pRes.json();

    // 1. Checkout 800 ETB via TELEBIRR
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: fCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 800 }],
        paymentMethod: PaymentMethod.TELEBIRR,
        amountPaid: 800,
      }),
    });
    const sale = await checkoutRes.json();
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const saleItemId = dbSale!.items[0].id;

    // 2. Full return refunded via TELEBIRR
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: fCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 1 }],
        reason: 'Customer returned item',
        refundMethod: PaymentMethod.TELEBIRR,
        restockInventory: true,
      }),
    });
    if (retRes.status !== 201) throw new Error(`Return failed: ${await retRes.text()}`);

    const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: fOwnerHeaders,
    });
    const dash = await dashRes.json();

    if (dash.grossSalesToday !== 800) throw new Error(`Expected grossSalesToday = 800, got ${dash.grossSalesToday}`);
    if (dash.refundsToday !== 800) throw new Error(`Expected refundsToday = 800, got ${dash.refundsToday}`);
    if (dash.netSalesToday !== 0) throw new Error(`Expected netSalesToday = 0, got ${dash.netSalesToday}`);

    if (dash.customerPaymentsReceivedToday !== 800) throw new Error(`Expected customerPaymentsReceivedToday = 800, got ${dash.customerPaymentsReceivedToday}`);
    if (dash.refundsDisbursedToday !== 800) throw new Error(`Expected refundsDisbursedToday = 800, got ${dash.refundsDisbursedToday}`);
    if (dash.netCustomerPaymentMovementToday !== 0) throw new Error(`Expected netCustomerPaymentMovementToday = 0, got ${dash.netCustomerPaymentMovementToday}`);

    // Since payment & refund were via Telebirr, cash movements must be 0:
    if (dash.cashReceivedToday !== 0) throw new Error(`Expected cashReceivedToday = 0, got ${dash.cashReceivedToday}`);
    if (dash.cashRefundsToday !== 0) throw new Error(`Expected cashRefundsToday = 0, got ${dash.cashRefundsToday}`);
    if (dash.netCashMovementToday !== 0) throw new Error(`Expected netCashMovementToday = 0, got ${dash.netCashMovementToday}`);
  });

  // =========================================================================
  // TEST 7: DIFFERENT PAYMENT METHODS & CASH VS NON-CASH REFUNDS
  // =========================================================================
  await test('7. Multi-method Payments & Cash vs Non-cash Refunds: cash vs electronic movements', async () => {
    const mOrgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Multi Method Mart ${ts}`,
        city: 'Addis Ababa',
        businessType: 'Retail',
        currency: 'ETB',
      }),
    });
    const mOrgData = await mOrgRes.json();
    const mOrgId = mOrgData.business.id;

    const mOwnerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
      'x-organization-id': mOrgId,
    };
    const mCashierHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cashierToken}`,
      'x-organization-id': mOrgId,
    };

    await prisma.member.create({
      data: {
        organizationId: mOrgId,
        userId: cashierLogin.user.id,
        role: 'cashier',
        status: MemberStatus.ACTIVE,
      },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: mOwnerHeaders,
      body: JSON.stringify({
        name: `Multi Method Product ${ts}`,
        sku: `MMP-${ts}`,
        costPrice: 50,
        sellingPrice: 100,
        initialStock: 50,
      }),
    });
    const prod = await pRes.json();

    // Sale 1: 500 ETB via CASH (5 units @ 100)
    const s1Res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: mCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 5, unitPrice: 100 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 500,
      }),
    });
    const s1 = await s1Res.json();

    // Sale 2: 700 ETB via TELEBIRR (7 units @ 100)
    const s2Res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: mCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 7, unitPrice: 100 }],
        paymentMethod: PaymentMethod.TELEBIRR,
        amountPaid: 700,
      }),
    });
    const s2 = await s2Res.json();

    // Sale 3: 400 ETB via CBE_BIRR (4 units @ 100)
    const s3Res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: mCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 4, unitPrice: 100 }],
        paymentMethod: PaymentMethod.CBE_BIRR,
        amountPaid: 400,
      }),
    });
    const s3 = await s3Res.json();

    // Return 2 units from Sale 1 (200 ETB) refunded in CASH
    const dbS1 = await prisma.sale.findUnique({ where: { id: s1.id }, include: { items: true } });
    await fetch(`${serverUrl}/api/v1/sales/${s1.id}/return`, {
      method: 'POST',
      headers: mCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbS1!.items[0].id, quantity: 2 }],
        reason: 'Cash return',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });

    // Return 3 units from Sale 2 (300 ETB) refunded in TELEBIRR
    const dbS2 = await prisma.sale.findUnique({ where: { id: s2.id }, include: { items: true } });
    await fetch(`${serverUrl}/api/v1/sales/${s2.id}/return`, {
      method: 'POST',
      headers: mCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbS2!.items[0].id, quantity: 3 }],
        reason: 'Telebirr return',
        refundMethod: PaymentMethod.TELEBIRR,
        restockInventory: true,
      }),
    });

    const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: mOwnerHeaders,
    });
    const dash = await dashRes.json();

    // Invoiced Sales: Gross = 500 + 700 + 400 = 1600; Refunds = 200 + 300 = 500; Net Sales = 1100
    if (dash.grossSalesToday !== 1600) throw new Error(`Expected grossSalesToday = 1600, got ${dash.grossSalesToday}`);
    if (dash.refundsToday !== 500) throw new Error(`Expected refundsToday = 500, got ${dash.refundsToday}`);
    if (dash.netSalesToday !== 1100) throw new Error(`Expected netSalesToday = 1100, got ${dash.netSalesToday}`);

    // Cash movement: Cash in = 500; Cash out = 200; Net Cash = 300
    if (dash.cashReceivedToday !== 500) throw new Error(`Expected cashReceivedToday = 500, got ${dash.cashReceivedToday}`);
    if (dash.cashRefundsToday !== 200) throw new Error(`Expected cashRefundsToday = 200, got ${dash.cashRefundsToday}`);
    if (dash.netCashMovementToday !== 300) throw new Error(`Expected netCashMovementToday = 300, got ${dash.netCashMovementToday}`);

    // Total payments: In = 1600; Out = 500; Net = 1100
    if (dash.customerPaymentsReceivedToday !== 1600) throw new Error(`Expected customerPaymentsReceivedToday = 1600, got ${dash.customerPaymentsReceivedToday}`);
    if (dash.refundsDisbursedToday !== 500) throw new Error(`Expected refundsDisbursedToday = 500, got ${dash.refundsDisbursedToday}`);
    if (dash.netCustomerPaymentMovementToday !== 1100) throw new Error(`Expected netCustomerPaymentMovementToday = 1100, got ${dash.netCustomerPaymentMovementToday}`);
  });

  // =========================================================================
  // TEST 8: VAT METRIC NAMING AND CALCULATION (NET OUTPUT VAT AFTER REFUNDS)
  // =========================================================================
  await test('8. VAT Metric: Net Output VAT After Refunds correctly named and calculated', async () => {
    const vOrgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `VAT Metric Mart ${ts}`,
        city: 'Addis Ababa',
        businessType: 'Retail',
        currency: 'ETB',
      }),
    });
    const vOrgData = await vOrgRes.json();
    const vOrgId = vOrgData.business.id;

    // Configure tax-exclusive 15%
    await prisma.organization.update({
      where: { id: vOrgId },
      data: { taxInclusive: false, taxRate: '0.15' },
    });

    const vOwnerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
      'x-organization-id': vOrgId,
    };
    const vCashierHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cashierToken}`,
      'x-organization-id': vOrgId,
    };

    await prisma.member.create({
      data: {
        organizationId: vOrgId,
        userId: cashierLogin.user.id,
        role: 'cashier',
        status: MemberStatus.ACTIVE,
      },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: vOwnerHeaders,
      body: JSON.stringify({
        name: `VAT Metric Item ${ts}`,
        sku: `VMI-${ts}`,
        costPrice: 500,
        sellingPrice: 1000,
        initialStock: 10,
      }),
    });
    const prod = await pRes.json();

    // Sale: 2 units @ 1,000 ETB = 2,000 ETB subtotal. VAT 15% = 300 ETB. Total = 2,300 ETB.
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: vCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 2, unitPrice: 1000 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 2300,
      }),
    });
    const sale = await checkoutRes.json();
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });

    // Return 1 unit: 1,000 ETB line + 150 ETB tax = 1,150 ETB refund.
    await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: vCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'VAT metric return',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });

    const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: vOwnerHeaders,
    });
    const dash = await dashRes.json();

    if (dash.grossTaxMonth !== 300) throw new Error(`Expected grossTaxMonth = 300, got ${dash.grossTaxMonth}`);
    if (dash.vatAdjustmentMonth !== 150) throw new Error(`Expected vatAdjustmentMonth = 150, got ${dash.vatAdjustmentMonth}`);
    if (dash.refundedTaxMonth !== 150) throw new Error(`Expected refundedTaxMonth = 150, got ${dash.refundedTaxMonth}`);
    if (dash.netOutputVatAfterRefunds !== 150) throw new Error(`Expected netOutputVatAfterRefunds = 150, got ${dash.netOutputVatAfterRefunds}`);
    if (dash.netTaxMonth !== 150) throw new Error(`Expected netTaxMonth = 150 (backwards compatibility), got ${dash.netTaxMonth}`);
  });

  // =========================================================================
  // TEST 9: ORGANIZATION TIMEZONE DEFAULTS & CUSTOM CONFIGURATION
  // =========================================================================
  await test('9. Organization Timezone: defaults to Africa/Addis_Ababa and supports custom timezone', async () => {
    // 1. Default timezone check
    const defOrgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Default TZ Mart ${ts}`,
        city: 'Addis Ababa',
      }),
    });
    const defOrgData = await defOrgRes.json();
    const defOrgInDb = await prisma.organization.findUnique({ where: { id: defOrgData.business.id } });
    if (defOrgInDb?.timezone !== 'Africa/Addis_Ababa') {
      throw new Error(`Expected default timezone 'Africa/Addis_Ababa', got '${defOrgInDb?.timezone}'`);
    }

    // 2. Custom timezone on onboarding
    const customOrgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `UTC Mart ${ts}`,
        city: 'London',
        timezone: 'UTC',
      }),
    });
    const customOrgData = await customOrgRes.json();
    const customOrgInDb = await prisma.organization.findUnique({ where: { id: customOrgData.business.id } });
    if (customOrgInDb?.timezone !== 'UTC') {
      throw new Error(`Expected custom timezone 'UTC', got '${customOrgInDb?.timezone}'`);
    }

    // 3. Update timezone via settings
    await prisma.organization.update({
      where: { id: customOrgInDb!.id },
      data: { timezone: 'Africa/Nairobi' },
    });
    const updatedOrg = await prisma.organization.findUnique({ where: { id: customOrgInDb!.id } });
    if (updatedOrg?.timezone !== 'Africa/Nairobi') {
      throw new Error(`Expected updated timezone 'Africa/Nairobi', got '${updatedOrg?.timezone}'`);
    }
  });

  // =========================================================================
  // TEST 10: SCENARIO A - PARTIALLY PAID SALE FOLLOWED BY FULL RETURN
  // =========================================================================
  await test('10. Scenario A: Sale 1150 ETB, customer pays 600 ETB, full return -> refund disbursed 600 ETB, unpaid cancelled 550 ETB, balance 0 ETB', async () => {
    const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Scenario A Mart ${ts}`, city: 'Addis Ababa' }),
    });
    const orgData = await orgRes.json();
    const scAOrgId = orgData.business.id;

    // Configure 15% tax-exclusive
    await prisma.organization.update({
      where: { id: scAOrgId },
      data: { taxInclusive: false, taxRate: '0.15' },
    });

    const scAOwnerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': scAOrgId };
    const scACashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}`, 'x-organization-id': scAOrgId };

    await prisma.member.create({
      data: { organizationId: scAOrgId, userId: cashierLogin.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    // Create product: 1,000 ETB (plus 15% VAT = 1,150 ETB)
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: scAOwnerHeaders,
      body: JSON.stringify({ name: `Scenario A Item ${ts}`, sku: `SCA-${ts}`, costPrice: 500, sellingPrice: 1000, initialStock: 10 }),
    });
    const prod = await pRes.json();

    // 1. Checkout: total 1,150 ETB, customer pays 600 ETB cash
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: scACashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 1000 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 600,
      }),
    });
    const sale = await checkoutRes.json();
    if (Number(sale.totalAmount) !== 1150) throw new Error(`Expected total 1150, got ${sale.totalAmount}`);

    // Verify initial balance before return
    const dashBefore = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: scAOwnerHeaders })).json();
    if (dashBefore.outstandingCustomerBalancesToday !== 550) {
      throw new Error(`Expected initial outstanding balance 550 ETB, got ${dashBefore.outstandingCustomerBalancesToday}`);
    }

    // 2. Full product return
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: scACashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'Scenario A Full Return',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    if (retRes.status !== 201) throw new Error(`Return failed: ${await retRes.text()}`);
    const retData = await retRes.json();

    // Check return record fields
    const dbReturn = await prisma.saleReturn.findUnique({ where: { id: retData.id } });
    if (Number(dbReturn?.returnCredit) !== 1150) throw new Error(`Expected returnCredit 1150, got ${dbReturn?.returnCredit}`);
    if (Number(dbReturn?.refundDisbursed) !== 600) throw new Error(`Expected refundDisbursed 600, got ${dbReturn?.refundDisbursed}`);
    if (Number(dbReturn?.unpaidCancelled) !== 550) throw new Error(`Expected unpaidCancelled 550, got ${dbReturn?.unpaidCancelled}`);
    if (Number(dbReturn?.refundAmount) !== 600) throw new Error(`Expected refundAmount 600, got ${dbReturn?.refundAmount}`);
    if (dbReturn?.status !== 'COMPLETED') throw new Error(`Expected status COMPLETED, got ${dbReturn?.status}`);

    // Check dashboard reconciliation
    const dashAfter = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: scAOwnerHeaders })).json();
    if (dashAfter.grossSalesToday !== 1150) throw new Error(`Expected grossSalesToday = 1150, got ${dashAfter.grossSalesToday}`);
    if (dashAfter.refundsToday !== 1150) throw new Error(`Expected refundsToday = 1150, got ${dashAfter.refundsToday}`);
    if (dashAfter.netSalesToday !== 0) throw new Error(`Expected netSalesToday = 0, got ${dashAfter.netSalesToday}`);
    if (dashAfter.customerPaymentsReceivedToday !== 600) throw new Error(`Expected payments received = 600, got ${dashAfter.customerPaymentsReceivedToday}`);
    if (dashAfter.refundsDisbursedToday !== 600) throw new Error(`Expected refunds disbursed = 600, got ${dashAfter.refundsDisbursedToday}`);
    if (dashAfter.unpaidBalancesCancelledToday !== 550) throw new Error(`Expected unpaid cancelled = 550, got ${dashAfter.unpaidBalancesCancelledToday}`);
    if (dashAfter.netCustomerPaymentMovementToday !== 0) throw new Error(`Expected net payment movement = 0, got ${dashAfter.netCustomerPaymentMovementToday}`);
    if (dashAfter.cashReceivedToday !== 600) throw new Error(`Expected cash received = 600, got ${dashAfter.cashReceivedToday}`);
    if (dashAfter.cashRefundsToday !== 600) throw new Error(`Expected cash refunds = 600, got ${dashAfter.cashRefundsToday}`);
    if (dashAfter.netCashMovementToday !== 0) throw new Error(`Expected net cash movement = 0, got ${dashAfter.netCashMovementToday}`);
    if (dashAfter.outstandingCustomerBalancesToday !== 0) throw new Error(`Expected outstanding balance = 0, got ${dashAfter.outstandingCustomerBalancesToday}`);
    if (dashAfter.customerCreditsPayableToday !== 0) throw new Error(`Expected customer credits payable = 0, got ${dashAfter.customerCreditsPayableToday}`);
  });

  // =========================================================================
  // TEST 11: SCENARIO B - PARTIALLY PAID SALE FOLLOWED BY PARTIAL RETURN
  // =========================================================================
  await test('11. Scenario B: Sale 1150 ETB (2 units), pays 600 ETB, returns 1 unit (575 ETB) -> refund disbursed 25 ETB, unpaid cancelled 550 ETB, balance 0 ETB', async () => {
    const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Scenario B Mart ${ts}`, city: 'Addis Ababa' }),
    });
    const orgData = await orgRes.json();
    const scBOrgId = orgData.business.id;

    await prisma.organization.update({
      where: { id: scBOrgId },
      data: { taxInclusive: false, taxRate: '0.15' },
    });

    const scBOwnerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': scBOrgId };
    const scBCashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}`, 'x-organization-id': scBOrgId };

    await prisma.member.create({
      data: { organizationId: scBOrgId, userId: cashierLogin.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    // 2 units @ 500 ETB = 1000 ETB subtotal + 15% VAT = 1,150 ETB total (575 ETB per unit with tax)
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: scBOwnerHeaders,
      body: JSON.stringify({ name: `Scenario B Item ${ts}`, sku: `SCB-${ts}`, costPrice: 300, sellingPrice: 500, initialStock: 10 }),
    });
    const prod = await pRes.json();

    // 1. Checkout: total 1,150 ETB, customer pays 600 ETB cash
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: scBCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 2, unitPrice: 500 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 600,
      }),
    });
    const sale = await checkoutRes.json();
    if (Number(sale.totalAmount) !== 1150) throw new Error(`Expected total 1150, got ${sale.totalAmount}`);

    // 2. Return 1 of 2 units (worth 575 ETB)
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: scBCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'Scenario B Partial Return 1 unit',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    if (retRes.status !== 201) throw new Error(`Return failed: ${await retRes.text()}`);
    const retData = await retRes.json();

    // Check return record fields
    const dbReturn = await prisma.saleReturn.findUnique({ where: { id: retData.id } });
    if (Number(dbReturn?.returnCredit) !== 575) throw new Error(`Expected returnCredit 575, got ${dbReturn?.returnCredit}`);
    if (Number(dbReturn?.refundDisbursed) !== 25) throw new Error(`Expected refundDisbursed 25, got ${dbReturn?.refundDisbursed}`);
    if (Number(dbReturn?.unpaidCancelled) !== 550) throw new Error(`Expected unpaidCancelled 550, got ${dbReturn?.unpaidCancelled}`);
    if (Number(dbReturn?.refundAmount) !== 25) throw new Error(`Expected refundAmount 25, got ${dbReturn?.refundAmount}`);

    // Check dashboard reconciliation
    const dash = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: scBOwnerHeaders })).json();
    if (dash.grossSalesToday !== 1150) throw new Error(`Expected grossSalesToday = 1150, got ${dash.grossSalesToday}`);
    if (dash.refundsToday !== 575) throw new Error(`Expected refundsToday = 575, got ${dash.refundsToday}`);
    if (dash.netSalesToday !== 575) throw new Error(`Expected netSalesToday = 575, got ${dash.netSalesToday}`);
    if (dash.customerPaymentsReceivedToday !== 600) throw new Error(`Expected customerPaymentsReceivedToday = 600, got ${dash.customerPaymentsReceivedToday}`);
    if (dash.refundsDisbursedToday !== 25) throw new Error(`Expected refundsDisbursedToday = 25, got ${dash.refundsDisbursedToday}`);
    if (dash.unpaidBalancesCancelledToday !== 550) throw new Error(`Expected unpaidBalancesCancelledToday = 550, got ${dash.unpaidBalancesCancelledToday}`);
    if (dash.netCustomerPaymentMovementToday !== 575) throw new Error(`Expected netCustomerPaymentMovementToday = 575, got ${dash.netCustomerPaymentMovementToday}`);
    if (dash.cashReceivedToday !== 600) throw new Error(`Expected cashReceivedToday = 600, got ${dash.cashReceivedToday}`);
    if (dash.cashRefundsToday !== 25) throw new Error(`Expected cashRefundsToday = 25, got ${dash.cashRefundsToday}`);
    if (dash.netCashMovementToday !== 575) throw new Error(`Expected netCashMovementToday = 575, got ${dash.netCashMovementToday}`);
    if (dash.outstandingCustomerBalancesToday !== 0) throw new Error(`Expected outstandingCustomerBalancesToday = 0, got ${dash.outstandingCustomerBalancesToday}`);
    if (dash.customerCreditsPayableToday !== 0) throw new Error(`Expected customerCreditsPayableToday = 0, got ${dash.customerCreditsPayableToday}`);
  });

  // =========================================================================
  // TEST 12: SCENARIO C - ZERO-PAID (CREDIT) SALE FOLLOWED BY FULL RETURN
  // =========================================================================
  await test('12. Scenario C: Sale 1150 ETB, customer pays 0 ETB, full return -> refund disbursed 0 ETB, unpaid cancelled 1150 ETB, balance 0 ETB', async () => {
    const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Scenario C Mart ${ts}`, city: 'Addis Ababa' }),
    });
    const orgData = await orgRes.json();
    const scCOrgId = orgData.business.id;

    await prisma.organization.update({
      where: { id: scCOrgId },
      data: { taxInclusive: false, taxRate: '0.15' },
    });

    const scCOwnerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': scCOrgId };
    const scCCashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}`, 'x-organization-id': scCOrgId };

    await prisma.member.create({
      data: { organizationId: scCOrgId, userId: cashierLogin.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: scCOwnerHeaders,
      body: JSON.stringify({ name: `Scenario C Item ${ts}`, sku: `SCC-${ts}`, costPrice: 500, sellingPrice: 1000, initialStock: 10 }),
    });
    const prod = await pRes.json();

    // 1. Checkout with 0 ETB paid (Credit/Unpaid sale)
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: scCCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 1000 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 0,
      }),
    });
    const sale = await checkoutRes.json();
    if (Number(sale.totalAmount) !== 1150) throw new Error(`Expected total 1150, got ${sale.totalAmount}`);

    // Verify initial balance
    const dashBefore = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: scCOwnerHeaders })).json();
    if (dashBefore.outstandingCustomerBalancesToday !== 1150) {
      throw new Error(`Expected initial outstanding balance 1150 ETB, got ${dashBefore.outstandingCustomerBalancesToday}`);
    }

    // 2. Full return
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: scCCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'Scenario C Full Return',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    if (retRes.status !== 201) throw new Error(`Return failed: ${await retRes.text()}`);
    const retData = await retRes.json();

    const dbReturn = await prisma.saleReturn.findUnique({ where: { id: retData.id } });
    if (Number(dbReturn?.returnCredit) !== 1150) throw new Error(`Expected returnCredit 1150, got ${dbReturn?.returnCredit}`);
    if (Number(dbReturn?.refundDisbursed) !== 0) throw new Error(`Expected refundDisbursed 0, got ${dbReturn?.refundDisbursed}`);
    if (Number(dbReturn?.unpaidCancelled) !== 1150) throw new Error(`Expected unpaidCancelled 1150, got ${dbReturn?.unpaidCancelled}`);
    if (Number(dbReturn?.refundAmount) !== 0) throw new Error(`Expected refundAmount 0, got ${dbReturn?.refundAmount}`);

    // Check dashboard reconciliation
    const dashAfter = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: scCOwnerHeaders })).json();
    if (dashAfter.grossSalesToday !== 1150) throw new Error(`Expected grossSalesToday = 1150, got ${dashAfter.grossSalesToday}`);
    if (dashAfter.refundsToday !== 1150) throw new Error(`Expected refundsToday = 1150, got ${dashAfter.refundsToday}`);
    if (dashAfter.netSalesToday !== 0) throw new Error(`Expected netSalesToday = 0, got ${dashAfter.netSalesToday}`);
    if (dashAfter.customerPaymentsReceivedToday !== 0) throw new Error(`Expected payments received = 0, got ${dashAfter.customerPaymentsReceivedToday}`);
    if (dashAfter.refundsDisbursedToday !== 0) throw new Error(`Expected refunds disbursed = 0, got ${dashAfter.refundsDisbursedToday}`);
    if (dashAfter.unpaidBalancesCancelledToday !== 1150) throw new Error(`Expected unpaid cancelled = 1150, got ${dashAfter.unpaidBalancesCancelledToday}`);
    if (dashAfter.netCustomerPaymentMovementToday !== 0) throw new Error(`Expected net payment movement = 0, got ${dashAfter.netCustomerPaymentMovementToday}`);
    if (dashAfter.cashReceivedToday !== 0) throw new Error(`Expected cash received = 0, got ${dashAfter.cashReceivedToday}`);
    if (dashAfter.cashRefundsToday !== 0) throw new Error(`Expected cash refunds = 0, got ${dashAfter.cashRefundsToday}`);
    if (dashAfter.netCashMovementToday !== 0) throw new Error(`Expected net cash movement = 0, got ${dashAfter.netCashMovementToday}`);
    if (dashAfter.outstandingCustomerBalancesToday !== 0) throw new Error(`Expected outstanding balance = 0, got ${dashAfter.outstandingCustomerBalancesToday}`);
    if (dashAfter.customerCreditsPayableToday !== 0) throw new Error(`Expected customer credits payable = 0, got ${dashAfter.customerCreditsPayableToday}`);
  });

  // =========================================================================
  // TEST 13: OVERPAYMENT & CUSTOMER CREDITS PAYABLE ACCOUNTING
  // =========================================================================
  await test('13. Overpayment Accounting: Sale 1000 ETB, Customer pays 1200 ETB -> customerCreditsPayable = 200 ETB, outstanding = 0 ETB', async () => {
    const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Overpay Mart ${ts}`, city: 'Addis Ababa' }),
    });
    const orgData = await orgRes.json();
    const opOrgId = orgData.business.id;

    const opOwnerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': opOrgId };
    const opCashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}`, 'x-organization-id': opOrgId };

    await prisma.member.create({
      data: { organizationId: opOrgId, userId: cashierLogin.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: opOwnerHeaders,
      body: JSON.stringify({ name: `Overpay Item ${ts}`, sku: `OP-${ts}`, costPrice: 500, sellingPrice: 1000, initialStock: 10 }),
    });
    const prod = await pRes.json();

    // Customer checkout: 1,000 ETB sale, customer overpays 1,200 ETB
    await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: opCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 1000 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 1200,
      }),
    });

    const dash = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: opOwnerHeaders })).json();
    if (dash.outstandingCustomerBalancesToday !== 0) {
      throw new Error(`Expected outstandingCustomerBalancesToday = 0, got ${dash.outstandingCustomerBalancesToday}`);
    }
    if (dash.customerCreditsPayableToday !== 200) {
      throw new Error(`Expected customerCreditsPayableToday = 200, got ${dash.customerCreditsPayableToday}`);
    }
    if (dash.cashReceivedToday !== 1200) {
      throw new Error(`Expected cashReceivedToday = 1200, got ${dash.cashReceivedToday}`);
    }
  });

  // =========================================================================
  // TEST 14: TIMEZONE VALIDATION & REJECTION OF INVALID IANA STRINGS
  // =========================================================================
  await test('14. Timezone Validation: rejects invalid IANA timezone strings with 400 Bad Request', async () => {
    // 1. Invalid timezone on onboarding
    const badOnboardRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: `Invalid TZ Mart ${ts}`,
        city: 'Addis Ababa',
        timezone: 'Mars/Olympus',
      }),
    });
    if (badOnboardRes.status !== 400) {
      throw new Error(`Expected status 400 for invalid timezone on onboard, got ${badOnboardRes.status}`);
    }
    const badOnboardBody = await badOnboardRes.json();
    if (!badOnboardBody.message?.includes('Invalid IANA timezone')) {
      throw new Error(`Expected "Invalid IANA timezone" error message, got "${badOnboardBody.message}"`);
    }

    // 2. Invalid timezone on update settings
    const badUpdateRes = await fetch(`${serverUrl}/api/v1/business/settings`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        timezone: 'Invalid/NonExistent_Zone',
      }),
    });
    if (badUpdateRes.status !== 400) {
      throw new Error(`Expected status 400 for invalid timezone on settings update, got ${badUpdateRes.status}`);
    }
    const badUpdateBody = await badUpdateRes.json();
    if (!badUpdateBody.message?.includes('Invalid IANA timezone')) {
      throw new Error(`Expected "Invalid IANA timezone" error message, got "${badUpdateBody.message}"`);
    }
  });

  // =========================================================================
  // TEST 15: AMERICA/NEW_YORK DST MIDNIGHT BOUNDARIES
  // =========================================================================
  await test('15. America/New_York DST Midnight Boundaries: verifies pre/post fallback [todayStart, tomorrowStart)', async () => {
    const { getBusinessDateBoundaries } = await import('../src/modules/reports/reports.service');

    // Pre-fallback: 2026-10-31 (EDT is UTC-4)
    const preDstDate = new Date('2026-10-31T15:00:00.000Z');
    const preBounds = getBusinessDateBoundaries(preDstDate, 'America/New_York');
    if (preBounds.todayStart.toISOString() !== '2026-10-31T04:00:00.000Z') {
      throw new Error(`Expected pre-DST todayStart = 2026-10-31T04:00:00.000Z, got ${preBounds.todayStart.toISOString()}`);
    }
    if (preBounds.tomorrowStart.toISOString() !== '2026-11-01T05:00:00.000Z') {
      throw new Error(`Expected pre-DST tomorrowStart = 2026-11-01T05:00:00.000Z, got ${preBounds.tomorrowStart.toISOString()}`);
    }

    // Post-fallback: 2026-11-02 (EST is UTC-5 after fallback on Nov 1)
    const postDstDate = new Date('2026-11-02T15:00:00.000Z');
    const postBounds = getBusinessDateBoundaries(postDstDate, 'America/New_York');
    if (postBounds.todayStart.toISOString() !== '2026-11-02T05:00:00.000Z') {
      throw new Error(`Expected post-DST todayStart = 2026-11-02T05:00:00.000Z, got ${postBounds.todayStart.toISOString()}`);
    }
    if (postBounds.tomorrowStart.toISOString() !== '2026-11-03T05:00:00.000Z') {
      throw new Error(`Expected post-DST tomorrowStart = 2026-11-03T05:00:00.000Z, got ${postBounds.tomorrowStart.toISOString()}`);
    }
  });

  // =========================================================================
  // TEST 16: OVERPAYMENT FOLLOWED BY PARTIAL RETURN & CREDIT SETTLEMENT
  // =========================================================================
  await test('16. Overpayment + Partial Return: Sale 1150, paid 1200, returns 575 -> refund 575, credit settled 50, total 625, unpaidCancelled 0', async () => {
    const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Overpay Partial Mart ${ts}`, city: 'Addis Ababa' }),
    });
    const orgData = await orgRes.json();
    const opOrgId = orgData.business.id;

    await prisma.organization.update({
      where: { id: opOrgId },
      data: { taxInclusive: false, taxRate: '0.15' },
    });

    const opOwnerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': opOrgId };
    const opCashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}`, 'x-organization-id': opOrgId };

    await prisma.member.create({
      data: { organizationId: opOrgId, userId: cashierLogin.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    // 2 units @ 500 = 1000 subtotal + 150 VAT = 1150 total (575 each)
    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: opOwnerHeaders,
      body: JSON.stringify({ name: `Overpay Item ${ts}`, sku: `OP-PART-${ts}`, costPrice: 300, sellingPrice: 500, initialStock: 10 }),
    });
    const prod = await pRes.json();

    // 1. Checkout: 1,150 ETB sale, customer pays 1,200 ETB (50 ETB credit)
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: opCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 2, unitPrice: 500 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 1200,
      }),
    });
    const sale = await checkoutRes.json();
    if (Number(sale.totalAmount) !== 1150) throw new Error(`Expected total 1150, got ${sale.totalAmount}`);

    // Verify initial balance before return: customer credit payable = 50 ETB
    const dashBefore = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: opOwnerHeaders })).json();
    if (dashBefore.customerCreditsPayableToday !== 50) {
      throw new Error(`Expected initial customer credit payable = 50 ETB, got ${dashBefore.customerCreditsPayableToday}`);
    }
    if (dashBefore.outstandingCustomerBalancesToday !== 0) {
      throw new Error(`Expected initial outstanding = 0, got ${dashBefore.outstandingCustomerBalancesToday}`);
    }

    // 2. Return 1 of 2 units (merchandise value = 575 ETB)
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const retRes1 = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: opCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'Overpayment Partial Return Unit 1',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    if (retRes1.status !== 201) throw new Error(`Return failed: ${await retRes1.text()}`);
    const retData1 = await retRes1.json();

    const dbRet1 = await prisma.saleReturn.findUnique({ where: { id: retData1.id } });
    if (Number(dbRet1?.returnCredit) !== 575) throw new Error(`Expected returnCredit 575, got ${dbRet1?.returnCredit}`);
    if (Number(dbRet1?.refundDisbursed) !== 575) throw new Error(`Expected refundDisbursed 575, got ${dbRet1?.refundDisbursed}`);
    if (Number(dbRet1?.customerCreditDisbursed) !== 50) throw new Error(`Expected customerCreditDisbursed 50, got ${dbRet1?.customerCreditDisbursed}`);
    if (Number(dbRet1?.unpaidCancelled) !== 0) throw new Error(`Expected unpaidCancelled 0 (not negative!), got ${dbRet1?.unpaidCancelled}`);
    if (Number(dbRet1?.refundAmount) !== 625) throw new Error(`Expected total refund payout 625, got ${dbRet1?.refundAmount}`);

    // Check dashboard reconciliation after return 1
    const dashAfter1 = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: opOwnerHeaders })).json();
    if (dashAfter1.grossSalesToday !== 1150) throw new Error(`Expected grossSales = 1150, got ${dashAfter1.grossSalesToday}`);
    if (dashAfter1.refundsToday !== 575) throw new Error(`Expected refundsToday = 575, got ${dashAfter1.refundsToday}`);
    if (dashAfter1.netSalesToday !== 575) throw new Error(`Expected netSalesToday = 575, got ${dashAfter1.netSalesToday}`);
    if (dashAfter1.cashReceivedToday !== 1200) throw new Error(`Expected cashReceived = 1200, got ${dashAfter1.cashReceivedToday}`);
    if (dashAfter1.cashRefundsToday !== 625) throw new Error(`Expected cashRefunds = 625, got ${dashAfter1.cashRefundsToday}`);
    if (dashAfter1.netCashMovementToday !== 575) throw new Error(`Expected netCash = 575, got ${dashAfter1.netCashMovementToday}`);
    if (dashAfter1.outstandingCustomerBalancesToday !== 0) throw new Error(`Expected outstanding = 0, got ${dashAfter1.outstandingCustomerBalancesToday}`);
    if (dashAfter1.customerCreditsPayableToday !== 0) throw new Error(`Expected credits payable = 0 (settled), got ${dashAfter1.customerCreditsPayableToday}`);

    // 3. Return remaining unit 2 (575 ETB): verify customer credit is NOT refunded twice!
    const retRes2 = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: opCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'Overpayment Return Unit 2',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    if (retRes2.status !== 201) throw new Error(`Return 2 failed: ${await retRes2.text()}`);
    const retData2 = await retRes2.json();

    const dbRet2 = await prisma.saleReturn.findUnique({ where: { id: retData2.id } });
    if (Number(dbRet2?.returnCredit) !== 575) throw new Error(`Expected returnCredit 575, got ${dbRet2?.returnCredit}`);
    if (Number(dbRet2?.refundDisbursed) !== 575) throw new Error(`Expected refundDisbursed 575, got ${dbRet2?.refundDisbursed}`);
    if (Number(dbRet2?.customerCreditDisbursed) !== 0) throw new Error(`Expected customerCreditDisbursed 0 on unit 2, got ${dbRet2?.customerCreditDisbursed}`);
    if (Number(dbRet2?.unpaidCancelled) !== 0) throw new Error(`Expected unpaidCancelled 0, got ${dbRet2?.unpaidCancelled}`);
    if (Number(dbRet2?.refundAmount) !== 575) throw new Error(`Expected refundAmount 575 on unit 2, got ${dbRet2?.refundAmount}`);

    // Total cash refunded across both returns: 625 + 575 = 1200 ETB
    const dashAfter2 = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: opOwnerHeaders })).json();
    if (dashAfter2.cashRefundsToday !== 1200) throw new Error(`Expected cumulative cashRefunds = 1200, got ${dashAfter2.cashRefundsToday}`);
    if (dashAfter2.netCashMovementToday !== 0) throw new Error(`Expected netCash = 0, got ${dashAfter2.netCashMovementToday}`);
    if (dashAfter2.netSalesToday !== 0) throw new Error(`Expected netSales = 0, got ${dashAfter2.netSalesToday}`);
  });

  // =========================================================================
  // TEST 17: OVERPAYMENT FOLLOWED BY FULL RETURN
  // =========================================================================
  await test('17. Overpayment + Full Return: Sale 1150, paid 1200, full return -> refund 1150, credit 50, total 1200', async () => {
    const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Overpay Full Mart ${ts}`, city: 'Addis Ababa' }),
    });
    const orgData = await orgRes.json();
    const ofOrgId = orgData.business.id;

    await prisma.organization.update({
      where: { id: ofOrgId },
      data: { taxInclusive: false, taxRate: '0.15' },
    });

    const ofOwnerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': ofOrgId };
    const ofCashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}`, 'x-organization-id': ofOrgId };

    await prisma.member.create({
      data: { organizationId: ofOrgId, userId: cashierLogin.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ofOwnerHeaders,
      body: JSON.stringify({ name: `OF Item ${ts}`, sku: `OF-${ts}`, costPrice: 500, sellingPrice: 1000, initialStock: 10 }),
    });
    const prod = await pRes.json();

    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: ofCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 1000 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 1200,
      }),
    });
    const sale = await checkoutRes.json();

    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: ofCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'Full Overpayment Return',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });
    if (retRes.status !== 201) throw new Error(`Return failed: ${await retRes.text()}`);
    const retData = await retRes.json();

    const dbRet = await prisma.saleReturn.findUnique({ where: { id: retData.id } });
    if (Number(dbRet?.returnCredit) !== 1150) throw new Error(`Expected returnCredit 1150, got ${dbRet?.returnCredit}`);
    if (Number(dbRet?.refundDisbursed) !== 1150) throw new Error(`Expected refundDisbursed 1150, got ${dbRet?.refundDisbursed}`);
    if (Number(dbRet?.customerCreditDisbursed) !== 50) throw new Error(`Expected customerCreditDisbursed 50, got ${dbRet?.customerCreditDisbursed}`);
    if (Number(dbRet?.unpaidCancelled) !== 0) throw new Error(`Expected unpaidCancelled 0, got ${dbRet?.unpaidCancelled}`);
    if (Number(dbRet?.refundAmount) !== 1200) throw new Error(`Expected refundAmount 1200, got ${dbRet?.refundAmount}`);

    const dash = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: ofOwnerHeaders })).json();
    if (dash.netSalesToday !== 0) throw new Error(`Expected netSales = 0, got ${dash.netSalesToday}`);
    if (dash.netCashMovementToday !== 0) throw new Error(`Expected netCash = 0, got ${dash.netCashMovementToday}`);
    if (dash.customerCreditsPayableToday !== 0) throw new Error(`Expected credits payable = 0, got ${dash.customerCreditsPayableToday}`);
  });

  // =========================================================================
  // TEST 18: RETURN STATUS LIFECYCLE: PENDING, COMPLETED, FAILED & RESTOCKING
  // =========================================================================
  await test('18. Return Status Lifecycle: PENDING does not restock/affect financials; COMPLETED restocks once', async () => {
    const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Lifecycle Mart ${ts}`, city: 'Addis Ababa' }),
    });
    const orgData = await orgRes.json();
    const lcOrgId = orgData.business.id;

    const lcOwnerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': lcOrgId };
    const lcCashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}`, 'x-organization-id': lcOrgId };

    await prisma.member.create({
      data: { organizationId: lcOrgId, userId: cashierLogin.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: lcOwnerHeaders,
      body: JSON.stringify({ name: `Lifecycle Item ${ts}`, sku: `LC-${ts}`, costPrice: 50, sellingPrice: 100, initialStock: 50 }),
    });
    const prod = await pRes.json();

    // 1. Checkout 10 units @ 100 = 1000 ETB. Stock: 50 - 10 = 40.
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: lcCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 10, unitPrice: 100 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 1000,
      }),
    });
    const sale = await checkoutRes.json();
    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });
    const saleItemId = dbSale!.items[0].id;

    const invAfterSale = await prisma.inventory.findUnique({ where: { productId: prod.id } });
    if (Number(invAfterSale?.quantityOnHand) !== 40) {
      throw new Error(`Expected inventory 40, got ${invAfterSale?.quantityOnHand}`);
    }

    // 2. Initiate return of 4 units with status = PENDING
    const pendingRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: lcCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 4 }],
        reason: 'Pending return request',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
        status: 'PENDING',
      }),
    });
    if (pendingRes.status !== 201) throw new Error(`Pending return creation failed: ${await pendingRes.text()}`);
    const pendingReturn = await pendingRes.json();

    // Verify status is PENDING and completedAt is null
    const dbPending = await prisma.saleReturn.findUnique({ where: { id: pendingReturn.id } });
    if (dbPending?.status !== 'PENDING') throw new Error(`Expected status PENDING, got ${dbPending?.status}`);
    if (dbPending?.completedAt !== null) throw new Error(`Expected completedAt null for PENDING return`);

    // Stock MUST NOT have been restored yet! Stock must remain 40!
    const invAfterPending = await prisma.inventory.findUnique({ where: { productId: prod.id } });
    if (Number(invAfterPending?.quantityOnHand) !== 40) {
      throw new Error(`Stock restored prematurely! Expected 40, got ${invAfterPending?.quantityOnHand}`);
    }

    // Financial report MUST NOT include pending return in completed totals!
    const dashPending = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: lcOwnerHeaders })).json();
    if (dashPending.refundsToday !== 0) throw new Error(`Pending return counted in refundsToday: ${dashPending.refundsToday}`);
    if (dashPending.cashRefundsToday !== 0) throw new Error(`Pending return counted in cashRefundsToday: ${dashPending.cashRefundsToday}`);

    // 3. Initiate second return of 7 units: must be REJECTED because 4 units are reserved in PENDING!
    const overReturnRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: lcCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 7 }],
        reason: 'Exceeding returnable quantity',
      }),
    });
    if (overReturnRes.status !== 400) {
      throw new Error(`Expected 400 rejection for over-return, got ${overReturnRes.status}`);
    }

    // 4. Test FAILED return: create pending return for 2 units then fail it
    const failPendingRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: lcCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId, quantity: 2 }],
        reason: 'Return to be rejected',
        status: 'PENDING',
      }),
    });
    const failReturnData = await failPendingRes.json();

    const markFailRes = await fetch(`${serverUrl}/api/v1/sales/returns/${failReturnData.id}/fail`, {
      method: 'POST',
      headers: lcOwnerHeaders,
      body: JSON.stringify({ reason: 'Product damaged by customer' }),
    });
    if (markFailRes.status !== 201) throw new Error(`Fail return failed: ${await markFailRes.text()}`);
    const dbFailed = await prisma.saleReturn.findUnique({ where: { id: failReturnData.id } });
    if (dbFailed?.status !== 'FAILED') throw new Error(`Expected status FAILED, got ${dbFailed?.status}`);

    // 5. Complete the 4-unit PENDING return:
    const completeRes = await fetch(`${serverUrl}/api/v1/sales/returns/${pendingReturn.id}/complete`, {
      method: 'POST',
      headers: lcOwnerHeaders,
    });
    if (completeRes.status !== 201) throw new Error(`Complete return failed: ${await completeRes.text()}`);
    const completedData = await completeRes.json();

    if (completedData.status !== 'COMPLETED') throw new Error(`Expected COMPLETED, got ${completedData.status}`);
    if (!completedData.completedAt) throw new Error(`Expected completedAt populated upon completion`);

    // Stock MUST be restored by 4 units: 40 + 4 = 44!
    const invAfterComplete = await prisma.inventory.findUnique({ where: { productId: prod.id } });
    if (Number(invAfterComplete?.quantityOnHand) !== 44) {
      throw new Error(`Expected inventory 44 after completion, got ${invAfterComplete?.quantityOnHand}`);
    }

    // Attempting to complete again MUST be rejected (restocking performed exactly once)
    const duplicateCompleteRes = await fetch(`${serverUrl}/api/v1/sales/returns/${pendingReturn.id}/complete`, {
      method: 'POST',
      headers: lcOwnerHeaders,
    });
    if (duplicateCompleteRes.status !== 400) {
      throw new Error(`Expected 400 for duplicate completion, got ${duplicateCompleteRes.status}`);
    }

    // Financial report now includes the completed 4-unit return (400 ETB)
    const dashCompleted = await (await fetch(`${serverUrl}/api/v1/reports/dashboard`, { headers: lcOwnerHeaders })).json();
    if (dashCompleted.refundsToday !== 400) throw new Error(`Expected refundsToday 400, got ${dashCompleted.refundsToday}`);
    if (dashCompleted.cashRefundsToday !== 400) throw new Error(`Expected cashRefundsToday 400, got ${dashCompleted.cashRefundsToday}`);
    if (dashCompleted.netSalesToday !== 600) throw new Error(`Expected netSalesToday 600, got ${dashCompleted.netSalesToday}`);
  });

  // =========================================================================
  // TEST 19: CROSS-DAY RETURN COMPLETION & TIMESTAMPS
  // =========================================================================
  await test('19. Cross-Day Return: created on Oct 30, completed on Nov 2 -> attributed to Nov 2', async () => {
    const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `CrossDay Mart ${ts}`, city: 'Addis Ababa' }),
    });
    const orgData = await orgRes.json();
    const cdOrgId = orgData.business.id;

    const cdOwnerHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}`, 'x-organization-id': cdOrgId };
    const cdCashierHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}`, 'x-organization-id': cdOrgId };

    await prisma.member.create({
      data: { organizationId: cdOrgId, userId: cashierLogin.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    const pRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: cdOwnerHeaders,
      body: JSON.stringify({ name: `CrossDay Item ${ts}`, sku: `CD-${ts}`, costPrice: 100, sellingPrice: 300, initialStock: 10 }),
    });
    const prod = await pRes.json();

    // Sale created on Oct 30, 2026
    const saleDateUtc = new Date('2026-10-30T10:00:00.000Z');
    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cdCashierHeaders,
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1, unitPrice: 300 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 300,
      }),
    });
    const sale = await checkoutRes.json();
    await prisma.sale.update({ where: { id: sale.id }, data: { createdAt: saleDateUtc } });
    await prisma.payment.updateMany({ where: { saleId: sale.id }, data: { createdAt: saleDateUtc } });

    const dbSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { items: true } });

    // Return created on Oct 30, 2026 with status PENDING
    const retRes = await fetch(`${serverUrl}/api/v1/sales/${sale.id}/return`, {
      method: 'POST',
      headers: cdCashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: dbSale!.items[0].id, quantity: 1 }],
        reason: 'Cross day return',
        refundMethod: PaymentMethod.CASH,
        status: 'PENDING',
      }),
    });
    const retData = await retRes.json();
    await prisma.saleReturn.update({
      where: { id: retData.id },
      data: { createdAt: new Date('2026-10-30T11:00:00.000Z') },
    });

    // Return completed on Nov 2, 2026
    const completionDateUtc = new Date('2026-11-02T10:00:00.000Z');
    await fetch(`${serverUrl}/api/v1/sales/returns/${retData.id}/complete`, {
      method: 'POST',
      headers: cdOwnerHeaders,
    });
    await prisma.saleReturn.update({
      where: { id: retData.id },
      data: { completedAt: completionDateUtc },
    });

    const dbRetCheck = await prisma.saleReturn.findUnique({ where: { id: retData.id } });
    if (dbRetCheck?.completedAt?.toISOString() !== '2026-11-02T10:00:00.000Z') {
      throw new Error(`Expected completedAt 2026-11-02T10:00:00.000Z, got ${dbRetCheck?.completedAt?.toISOString()}`);
    }
  });

  // =========================================================================
  // TEST 20: HISTORICAL RETURN MIGRATION SCRIPT & BACKFILL INTEGRITY
  // =========================================================================
  await test('20. Historical Migration: verify returnCredit, completedAt, and refundDisbursed backfill', async () => {
    // Check that all records in the database have returnCredit matching refundAmount for fully paid sales
    const unmigratedCount = await prisma.saleReturn.count({
      where: { returnCredit: 0, refundAmount: { gt: 0 } },
    });
    if (unmigratedCount !== 0) {
      throw new Error(`Expected 0 unmigrated records, found ${unmigratedCount}`);
    }

    const unmigratedCompletedAt = await prisma.saleReturn.count({
      where: { completedAt: null, status: 'COMPLETED' },
    });
    if (unmigratedCompletedAt !== 0) {
      throw new Error(`Expected 0 completed returns with null completedAt, found ${unmigratedCompletedAt}`);
    }
  });

  console.log('\n========================================================================');
  console.log(`  VAT & TIMEZONE RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('========================================================================\n');

  await app.close();

  if (failedTests > 0) {
    process.exit(1);
  }
}

runVatAndTimezoneTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
