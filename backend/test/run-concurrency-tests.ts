import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { PaymentMethod, PurchaseStatus, SaleStatus, StockMovementType, MemberStatus } from '@prisma/client';

async function runConcurrencyTests() {
  console.log('========================================================================');
  console.log('  DUKAFLOW PHASE 3: CONCURRENCY & INTEGRATION VERIFICATION SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const testPort = 5998;
  await app.listen(testPort);
  const serverUrl = `http://localhost:${testPort}`;
  const prisma = app.get(PrismaService);

  const ts = Date.now();
  const password = 'ConcurrencyTestPass2026!';

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
  console.log('--- Setting up test workspace for concurrency verification ---');
  const ownerReg = await registerUser('Concurrency Owner', `conc-owner-${ts}@dukaflow.et`);
  const cashier1Reg = await registerUser('Concurrency Cashier 1', `conc-c1-${ts}@dukaflow.et`);
  const cashier2Reg = await registerUser('Concurrency Cashier 2', `conc-c2-${ts}@dukaflow.et`);
  const manager1Reg = await registerUser('Concurrency Manager 1', `conc-m1-${ts}@dukaflow.et`);
  const manager2Reg = await registerUser('Concurrency Manager 2', `conc-m2-${ts}@dukaflow.et`);

  const ownerLogin = await loginUser(`conc-owner-${ts}@dukaflow.et`);
  const cashier1Login = await loginUser(`conc-c1-${ts}@dukaflow.et`);
  const cashier2Login = await loginUser(`conc-c2-${ts}@dukaflow.et`);
  const manager1Login = await loginUser(`conc-m1-${ts}@dukaflow.et`);
  const manager2Login = await loginUser(`conc-m2-${ts}@dukaflow.et`);

  const ownerToken = ownerLogin.session.token;
  const cashier1Token = cashier1Login.session.token;
  const cashier2Token = cashier2Login.session.token;
  const manager1Token = manager1Login.session.token;
  const manager2Token = manager2Login.session.token;

  // Onboard Business
  const orgRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      name: `Concurrency Mart ${ts}`,
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
  const cashier1Headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cashier1Token}`,
    'x-organization-id': orgId,
  };
  const cashier2Headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cashier2Token}`,
    'x-organization-id': orgId,
  };
  const manager1Headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${manager1Token}`,
    'x-organization-id': orgId,
  };
  const manager2Headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${manager2Token}`,
    'x-organization-id': orgId,
  };

  // Add cashier & manager members with separate authenticated accounts
  await prisma.member.createMany({
    data: [
      {
        organizationId: orgId,
        userId: cashier1Login.user.id,
        role: 'cashier',
        status: MemberStatus.ACTIVE,
      },
      {
        organizationId: orgId,
        userId: cashier2Login.user.id,
        role: 'cashier',
        status: MemberStatus.ACTIVE,
      },
      {
        organizationId: orgId,
        userId: manager1Login.user.id,
        role: 'manager',
        status: MemberStatus.ACTIVE,
      },
      {
        organizationId: orgId,
        userId: manager2Login.user.id,
        role: 'manager',
        status: MemberStatus.ACTIVE,
      },
    ],
  });

  // Create a Supplier
  const suppRes = await fetch(`${serverUrl}/api/v1/purchases/suppliers`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      name: `Concurrency Supplier ${ts}`,
      contactName: 'Ato Bekele',
      phoneNumber: '+251911998877',
    }),
  });
  const suppData = await suppRes.json();
  const supplierId = suppData.id;

  // Create a Product for Return concurrency test
  const prodRes = await fetch(`${serverUrl}/api/v1/products`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      name: `High-Demand Coffee Beans ${ts}`,
      sku: `COF-CONC-${ts}`,
      costPrice: 200,
      sellingPrice: 350,
      initialStock: 20,
    }),
  });
  const prodData = await prodRes.json();
  const returnProductId = prodData.id;

  // Cashier 1 sells 5 units of this coffee
  const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
    method: 'POST',
    headers: cashier1Headers,
    body: JSON.stringify({
      items: [{ productId: returnProductId, quantity: 5, unitPrice: 350 }],
      paymentMethod: PaymentMethod.CASH,
      amountPaid: 1750,
    }),
  });
  if (checkoutRes.status !== 201) {
    const errText = await checkoutRes.text();
    throw new Error(`Checkout failed with status ${checkoutRes.status}: ${errText}`);
  }
  const checkoutData = await checkoutRes.json();
  const testSaleId = checkoutData.id;

  const dbSale = await prisma.sale.findUnique({
    where: { id: testSaleId },
    include: { items: true },
  });
  const testSaleItemId = dbSale!.items[0].id;

  // =========================================================================
  // TEST 1: CONCURRENT SALE RETURNS
  // =========================================================================
  await test('1. Concurrent Returns: serialize concurrent return requests from separate cashiers', async () => {
    // Initial: 5 units sold.
    // Launch 2 simultaneous return requests from separate cashier accounts for 4 units each.
    // Combined requested return = 8 units (> 5 units sold).
    // Exactly 1 must succeed (HTTP 201), the other must be rejected (HTTP 400).
    const returnPayload = {
      items: [{ saleItemId: testSaleItemId, quantity: 4 }],
      reason: 'Concurrent return test attempt',
      refundMethod: PaymentMethod.CASH,
      restockInventory: true,
    };

    const [res1, res2] = await Promise.all([
      fetch(`${serverUrl}/api/v1/sales/${testSaleId}/return`, {
        method: 'POST',
        headers: cashier1Headers,
        body: JSON.stringify(returnPayload),
      }),
      fetch(`${serverUrl}/api/v1/sales/${testSaleId}/return`, {
        method: 'POST',
        headers: cashier2Headers,
        body: JSON.stringify(returnPayload),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    if (statuses[0] !== 201 || statuses[1] !== 400) {
      const b1 = await res1.text();
      const b2 = await res2.text();
      throw new Error(`Expected [201, 400], got [${res1.status}, ${res2.status}]. Response 1: ${b1}, Response 2: ${b2}`);
    }

    // Check DB state: exactly 1 return record, 4 items returned, 1 item remains returnable
    const returnsInDb = await prisma.saleReturn.findMany({
      where: { saleId: testSaleId },
      include: { items: true },
    });
    if (returnsInDb.length !== 1) {
      throw new Error(`Expected exactly 1 return record in DB, found ${returnsInDb.length}`);
    }
    if (Number(returnsInDb[0].items[0].quantity) !== 4) {
      throw new Error(`Expected 4 items returned, got ${returnsInDb[0].items[0].quantity}`);
    }

    // Check inventory: 20 initial - 5 sold + 4 returned = 19
    const inv = await prisma.inventory.findUnique({ where: { productId: returnProductId } });
    if (Number(inv?.quantityOnHand) !== 19) {
      throw new Error(`Expected inventoryOnHand = 19, got ${inv?.quantityOnHand}`);
    }
  });

  // =========================================================================
  // TEST 2: CONCURRENT PURCHASE RECEIVING
  // =========================================================================
  await test('2. Concurrent Purchase Receiving: serialize receiving & prevent exceeding ordered quantity', async () => {
    // Create Product for purchase receiving
    const pProdRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Cooking Oil Bulk ${ts}`,
        sku: `OIL-CONC-${ts}`,
        costPrice: 500,
        sellingPrice: 700,
        initialStock: 0,
      }),
    });
    const pProd = await pProdRes.json();

    // Create Purchase Order for 10 units
    const poRes = await fetch(`${serverUrl}/api/v1/purchases`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        supplierId,
        items: [{ productId: pProd.id, orderedQty: 10, unitCost: 500 }],
      }),
    });
    const po = await poRes.json();
    const poItemId = po.items[0].id;

    // Launch 2 simultaneous receiving requests for 7 units each.
    // Combined requested receive = 14 units (> 10 units ordered).
    // Exactly 1 must succeed (HTTP 200 or 201), the other must be rejected (HTTP 400).
    const receivePayload = {
      receivedItems: [{ purchaseItemId: poItemId, receivedQty: 7 }],
    };

    const [res1, res2] = await Promise.all([
      fetch(`${serverUrl}/api/v1/purchases/${po.id}/receive`, {
        method: 'POST',
        headers: manager1Headers,
        body: JSON.stringify(receivePayload),
      }),
      fetch(`${serverUrl}/api/v1/purchases/${po.id}/receive`, {
        method: 'POST',
        headers: manager2Headers,
        body: JSON.stringify(receivePayload),
      }),
    ]);

    const statuses = [res1.status, res2.status];
    const hasSuccess = statuses.includes(200) || statuses.includes(201);
    const hasBadRequest = statuses.includes(400);
    if (!hasSuccess || !hasBadRequest) {
      const b1 = await res1.text();
      const b2 = await res2.text();
      throw new Error(`Expected [201, 400], got [${res1.status}, ${res2.status}]. Response 1: ${b1}, Response 2: ${b2}`);
    }

    // Verify DB state: receivedQty = 7, purchase status = PARTIALLY_RECEIVED
    const poItemInDb = await prisma.purchaseItem.findUnique({ where: { id: poItemId } });
    if (Number(poItemInDb?.receivedQty) !== 7) {
      throw new Error(`Expected receivedQty = 7, found ${poItemInDb?.receivedQty}`);
    }

    const updatedPo = await prisma.purchase.findUnique({ where: { id: po.id } });
    if (updatedPo?.status !== PurchaseStatus.PARTIALLY_RECEIVED) {
      throw new Error(`Expected purchase status PARTIALLY_RECEIVED, found ${updatedPo?.status}`);
    }

    // Verify inventory movement and stock on hand: exactly 7 units
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        productId: pProd.id,
        type: StockMovementType.PURCHASE_RECEIPT,
        referenceId: po.id,
      },
    });
    if (movements.length !== 1 || Number(movements[0].quantity) !== 7) {
      throw new Error(`Expected exactly 1 PURCHASE_RECEIPT movement with qty 7, found ${movements.length}`);
    }

    const inv = await prisma.inventory.findUnique({ where: { productId: pProd.id } });
    if (Number(inv?.quantityOnHand) !== 7) {
      throw new Error(`Expected inventory quantityOnHand = 7, got ${inv?.quantityOnHand}`);
    }
  });

  // =========================================================================
  // TEST 3: CONCURRENT INVITATION ACCEPTANCE
  // =========================================================================
  await test('3. Concurrent Invitation Acceptance: prevent double acceptance of same invitation', async () => {
    const inviteeEmail = `invitee-conc-${ts}@dukaflow.et`;

    // 1. Owner creates invitation for email that does not exist in DB yet
    const invRes = await fetch(`${serverUrl}/api/v1/business/members/invite`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        email: inviteeEmail,
        role: 'cashier',
      }),
    });
    if (invRes.status !== 201 && invRes.status !== 200) {
      throw new Error(`Invite failed with ${invRes.status}`);
    }
    const invData = await invRes.json();
    const invitationId = invData.id;

    // 2. User registers and logs in
    await registerUser('Invitee Concurrent', inviteeEmail);
    const inviteeLogin = await loginUser(inviteeEmail);
    const inviteeToken = inviteeLogin.session.token;

    // 3. Launch 2 simultaneous acceptance calls for the same invitation ID
    const [res1, res2] = await Promise.all([
      fetch(`${serverUrl}/api/v1/business/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inviteeToken}`,
        },
      }),
      fetch(`${serverUrl}/api/v1/business/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inviteeToken}`,
        },
      }),
    ]);

    const statuses = [res1.status, res2.status];
    const hasSuccess = statuses.includes(200) || statuses.includes(201);
    const hasBadRequest = statuses.includes(400);
    if (!hasSuccess || !hasBadRequest) {
      const b1 = await res1.text();
      const b2 = await res2.text();
      throw new Error(`Expected [200/201, 400], got [${res1.status}, ${res2.status}]. Response 1: ${b1}, Response 2: ${b2}`);
    }

    // Verify DB: exactly 1 member created for this user and org
    const members = await prisma.member.findMany({
      where: { organizationId: orgId, userId: inviteeLogin.user.id },
    });
    if (members.length !== 1) {
      throw new Error(`Expected exactly 1 member in DB, found ${members.length}`);
    }

    // Invitation status in DB is accepted
    const invInDb = await prisma.invitation.findUnique({ where: { id: invitationId } });
    if (invInDb?.status !== 'accepted') {
      throw new Error(`Expected invitation status accepted, got ${invInDb?.status}`);
    }
  });

  // =========================================================================
  // TEST 4: INVITATION ACCEPTANCE VS REVOCATION RACE
  // =========================================================================
  await test('4. Invitation Acceptance vs Revocation Race: serialize safely without orphan state', async () => {
    const inviteeEmail = `invitee-race-${ts}@dukaflow.et`;

    // 1. Owner creates invitation for email that does not exist in DB yet
    const invRes = await fetch(`${serverUrl}/api/v1/business/members/invite`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        email: inviteeEmail,
        role: 'cashier',
      }),
    });
    if (invRes.status !== 201 && invRes.status !== 200) {
      throw new Error(`Invite failed with ${invRes.status}`);
    }
    const invData = await invRes.json();
    const invitationId = invData.id;

    // 2. User registers and logs in
    await registerUser('Invitee Race', inviteeEmail);
    const inviteeLogin = await loginUser(inviteeEmail);
    const inviteeToken = inviteeLogin.session.token;

    // 3. Race: Invitee accepts while Owner cancels/revokes
    const [acceptRes, cancelRes] = await Promise.all([
      fetch(`${serverUrl}/api/v1/business/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inviteeToken}`,
        },
      }),
      fetch(`${serverUrl}/api/v1/business/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: ownerHeaders,
      }),
    ]);

    // Exactly one should succeed (200 or 201), and the loser must receive 400
    const statuses = [acceptRes.status, cancelRes.status];
    const hasSuccess = statuses.includes(200) || statuses.includes(201);
    const hasBadRequest = statuses.includes(400);
    if (!hasSuccess || !hasBadRequest) {
      const b1 = await acceptRes.text();
      const b2 = await cancelRes.text();
      throw new Error(`Expected [200/201, 400], got accept: ${acceptRes.status}, cancel: ${cancelRes.status}. Accept: ${b1}, Cancel: ${b2}`);
    }

    // Verify DB integrity
    const invInDb = await prisma.invitation.findUnique({ where: { id: invitationId } });
    const members = await prisma.member.findMany({
      where: { organizationId: orgId, userId: inviteeLogin.user.id },
    });

    if (invInDb?.status === 'accepted') {
      if (members.length !== 1) {
        throw new Error(`Accept won but member record not created`);
      }
    } else if (invInDb?.status === 'revoked') {
      if (members.length !== 0) {
        throw new Error(`Revocation won but member record was created`);
      }
    } else {
      throw new Error(`Unexpected final invitation status: ${invInDb?.status}`);
    }
  });

  // =========================================================================
  // TEST 5: REFUND ACCOUNTING & REPORT INTEGRITY
  // =========================================================================
  await test('5. Refund Accounting: verify Gross Sales, Refunds, Net Sales, and COGS Reversal', async () => {
    // Current org state:
    // Coffee sale: sold 5 @ 350 = 1750 (cost 200/each = 1000 gross cogs).
    // 4 units returned with restockInventory = true @ 350 = 1400 refund (4 * 200 = 800 cogs reversal).
    // Gross sales = 1750
    // Refunds = 1400
    // Net sales = 350
    // Gross COGS = 1000
    // Restocked COGS = 800
    // Net COGS = 200
    // Gross Profit = 350 - 200 = 150.

    const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: ownerHeaders,
    });
    if (dashRes.status !== 200) throw new Error(`Dashboard status: ${dashRes.status}`);
    const dash = await dashRes.json();

    if (dash.grossSalesToday !== 1750) {
      throw new Error(`Expected grossSalesToday = 1750, got ${dash.grossSalesToday}`);
    }
    if (dash.refundsToday !== 1400) {
      throw new Error(`Expected refundsToday = 1400, got ${dash.refundsToday}`);
    }
    if (dash.netSalesToday !== 350) {
      throw new Error(`Expected netSalesToday = 350, got ${dash.netSalesToday}`);
    }
    if (dash.salesToday !== 350) {
      throw new Error(`Expected salesToday = 350, got ${dash.salesToday}`);
    }
    if (dash.grossCogsMonth !== 1000) {
      throw new Error(`Expected grossCogsMonth = 1000, got ${dash.grossCogsMonth}`);
    }
    if (dash.restockedCogsMonth !== 800) {
      throw new Error(`Expected restockedCogsMonth = 800, got ${dash.restockedCogsMonth}`);
    }
    if (dash.netCogsMonth !== 200) {
      throw new Error(`Expected netCogsMonth = 200, got ${dash.netCogsMonth}`);
    }
    if (dash.grossProfitMonth !== 150) {
      throw new Error(`Expected grossProfitMonth = 150, got ${dash.grossProfitMonth}`);
    }

    // Verify Manager dashboard: masked gross profit & masked wholesale cogs
    const mgrDashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
      headers: manager1Headers,
    });
    const mgrDash = await mgrDashRes.json();
    if (mgrDash.grossProfitMonth !== undefined || mgrDash.kpi?.grossProfitMonth !== undefined) {
      throw new Error('Manager dashboard leaked gross profit');
    }
    if (mgrDash.cogsMonth !== undefined || mgrDash.kpi?.cogsMonth !== undefined) {
      throw new Error('Manager dashboard leaked wholesale COGS');
    }

    // Verify Cashier summary: netSalesToday = 350, no wholesale cost price exposed
    const cashSumRes = await fetch(`${serverUrl}/api/v1/reports/cashier-summary`, {
      headers: cashier1Headers,
    });
    const cashSum = await cashSumRes.json();
    if (cashSum.totalSales !== 350 || cashSum.netSalesToday !== 350) {
      throw new Error(`Expected cashier net sales = 350, got totalSales=${cashSum.totalSales}, netSalesToday=${cashSum.netSalesToday}`);
    }
    if (cashSum.cogs !== undefined || cashSum.grossProfit !== undefined) {
      throw new Error('Cashier summary leaked cost/profit data');
    }
  });

  console.log('\n========================================================================');
  console.log(`  CONCURRENCY RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('========================================================================\n');

  await app.close();

  if (failedTests > 0) {
    process.exit(1);
  }
}

runConcurrencyTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
