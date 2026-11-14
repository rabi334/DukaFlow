import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { MemberStatus, PaymentMethod } from '@prisma/client';
import { AppRole, AppPermission, roleHasPermission, getPermissionsForRole } from '../src/common/auth/permissions';

async function main() {
  console.log('========================================================================');
  console.log('  DUKAFLOW PHASE 2: ROLE-BASED ACCESS CONTROL (RBAC) VERIFICATION SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const testPort = 5997;
  await app.listen(testPort);
  const serverUrl = `http://localhost:${testPort}`;
  const prisma = app.get(PrismaService);

  const timestamp = Date.now();
  const password = 'StrongPassword2026!';

  // Users to register and test
  const ownerEmail = `owner_p2_${timestamp}@dukaflow.et`;
  const managerEmail = `manager_p2_${timestamp}@dukaflow.et`;
  const cashier1Email = `cashier1_p2_${timestamp}@dukaflow.et`;
  const cashier2Email = `cashier2_p2_${timestamp}@dukaflow.et`;
  const inventoryStaffEmail = `invstaff_p2_${timestamp}@dukaflow.et`;
  const nonMemberEmail = `outsider_p2_${timestamp}@dukaflow.et`;
  const platformAdminEmail = `platadmin_p2_${timestamp}@dukaflow.et`;

  let ownerToken = '', ownerId = '';
  let managerToken = '', managerId = '', managerMemberId = '';
  let cashier1Token = '', cashier1Id = '', cashier1MemberId = '';
  let cashier2Token = '', cashier2Id = '', cashier2MemberId = '';
  let invStaffToken = '', invStaffId = '', invStaffMemberId = '';
  let nonMemberToken = '', nonMemberId = '';
  let platAdminToken = '', platAdminId = '';

  let businessId = '';
  let testProductId = '';

  const results: { name: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`• Testing: ${name}... `);
    try {
      await fn();
      results.push({ name, status: 'PASSED' });
      console.log('✅ PASSED');
    } catch (err: any) {
      results.push({ name, status: 'FAILED', error: err.message || String(err) });
      console.log(`❌ FAILED: ${err.message || String(err)}`);
    }
  }

  // Helper to register a user
  async function registerUser(name: string, email: string): Promise<{ token: string; userId: string }> {
    const res = await fetch(`${serverUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (res.status !== 201) {
      throw new Error(`Failed to register ${email}: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return { token: data.token, userId: data.user.id };
  }

  try {
    // ------------------------------------------------------------------
    // SETUP: Provision Users, Workspace & Memberships
    // ------------------------------------------------------------------
    console.log('--- Setting up test users and workspace ---');
    const ownerRes = await registerUser('Dawit Owner', ownerEmail);
    ownerToken = ownerRes.token;
    ownerId = ownerRes.userId;

    const mgrRes = await registerUser('Almaz Manager', managerEmail);
    managerToken = mgrRes.token;
    managerId = mgrRes.userId;

    const c1Res = await registerUser('Bekele Cashier 1', cashier1Email);
    cashier1Token = c1Res.token;
    cashier1Id = c1Res.userId;

    const c2Res = await registerUser('Chala Cashier 2', cashier2Email);
    cashier2Token = c2Res.token;
    cashier2Id = c2Res.userId;

    const invRes = await registerUser('Tadesse Inventory', inventoryStaffEmail);
    invStaffToken = invRes.token;
    invStaffId = invRes.userId;

    const outRes = await registerUser('Outsider NoOrg', nonMemberEmail);
    nonMemberToken = outRes.token;
    nonMemberId = outRes.userId;

    const platRes = await registerUser('Platform Admin', platformAdminEmail);
    platAdminToken = platRes.token;
    platAdminId = platRes.userId;

    // Owner onboards business
    const onboardRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Bole Supermarket ${timestamp}`,
        city: 'Addis Ababa',
        businessType: 'Retail',
        currency: 'ETB',
      }),
    });
    const onboardData = await onboardRes.json();
    businessId = onboardData.business.id;

    // Assign memberships to business
    const m1 = await prisma.member.create({
      data: { organizationId: businessId, userId: managerId, role: 'manager', status: MemberStatus.ACTIVE },
    });
    managerMemberId = m1.id;

    const m2 = await prisma.member.create({
      data: { organizationId: businessId, userId: cashier1Id, role: 'cashier', status: MemberStatus.ACTIVE },
    });
    cashier1MemberId = m2.id;

    const m3 = await prisma.member.create({
      data: { organizationId: businessId, userId: cashier2Id, role: 'cashier', status: MemberStatus.ACTIVE },
    });
    cashier2MemberId = m3.id;

    const m4 = await prisma.member.create({
      data: { organizationId: businessId, userId: invStaffId, role: 'inventory_staff', status: MemberStatus.ACTIVE },
    });
    invStaffMemberId = m4.id;

    // Create a product with sensitive wholesale cost price
    const prodRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        'x-organization-id': businessId,
      },
      body: JSON.stringify({
        name: 'Mama Milk 500ml',
        sku: `MILK-${timestamp}`,
        costPrice: 40.0, // Sensitive wholesale cost price
        sellingPrice: 55.0, // Retail selling price
        initialStock: 100,
        minStockThreshold: 10,
        unit: 'pcs',
      }),
    });
    const prodData = await prodRes.json();
    testProductId = prodData.id;

    console.log(`Setup complete. Business ID: ${businessId}, Product ID: ${testProductId}\n`);

    // ------------------------------------------------------------------
    // TEST 1: Cashier cannot access business profit reports (HTTP 403)
    // ------------------------------------------------------------------
    await test('1. Cashier cannot access business profit reports (HTTP 403)', async () => {
      const res = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      if (res.status !== 403) {
        throw new Error(`Expected HTTP 403 Forbidden, got ${res.status}`);
      }

      const chartRes = await fetch(`${serverUrl}/api/v1/reports/charts/daily-sales`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      if (chartRes.status !== 403) {
        throw new Error(`Expected HTTP 403 Forbidden on sales chart, got ${chartRes.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 2: Cashier cannot access expenses (HTTP 403)
    // ------------------------------------------------------------------
    await test('2. Cashier cannot access expenses (HTTP 403)', async () => {
      const getRes = await fetch(`${serverUrl}/api/v1/expenses`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      if (getRes.status !== 403) {
        throw new Error(`Expected HTTP 403 on GET expenses, got ${getRes.status}`);
      }

      const postRes = await fetch(`${serverUrl}/api/v1/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({
          category: 'Rent',
          amount: 5000,
          description: 'Unauthorized expense attempt',
          paymentMethod: 'CASH',
          date: new Date().toISOString(),
        }),
      });
      if (postRes.status !== 403) {
        throw new Error(`Expected HTTP 403 on POST expenses, got ${postRes.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 3: Cashier cannot view wholesale cost prices through product APIs
    // ------------------------------------------------------------------
    await test('3. Cashier cannot view wholesale cost prices (costPrice stripped)', async () => {
      // 3a. GET /products list
      const listRes = await fetch(`${serverUrl}/api/v1/products`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      if (listRes.status !== 200) {
        throw new Error(`Expected HTTP 200, got ${listRes.status}`);
      }
      const products = await listRes.json();
      const p = products.find((item: any) => item.id === testProductId);
      if (!p) throw new Error('Test product not found in cashier response');
      if (p.costPrice !== undefined && p.costPrice !== null) {
        throw new Error(`VULNERABILITY: Cashier received costPrice: ${p.costPrice}`);
      }
      if (Number(p.sellingPrice) !== 55.0) {
        throw new Error(`Expected sellingPrice 55.0, got ${p.sellingPrice}`);
      }

      // 3b. GET /products/:id single lookup
      const singleRes = await fetch(`${serverUrl}/api/v1/products/${testProductId}`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      const singleProduct = await singleRes.json();
      if (singleProduct.costPrice !== undefined && singleProduct.costPrice !== null) {
        throw new Error(`VULNERABILITY: Cashier received costPrice on single product lookup: ${singleProduct.costPrice}`);
      }

      // 3c. GET /products/lookup by barcode / sku
      const lookupRes = await fetch(`${serverUrl}/api/v1/products/lookup?code=MILK-${timestamp}`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      const lookupProduct = await lookupRes.json();
      if (lookupProduct.costPrice !== undefined && lookupProduct.costPrice !== null) {
        throw new Error(`VULNERABILITY: Cashier received costPrice on barcode lookup: ${lookupProduct.costPrice}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 4: Cashier cannot access another cashier's sales records
    // ------------------------------------------------------------------
    await test("4. Cashier cannot access another cashier's sales records", async () => {
      // Cashier 1 makes a sale
      const sale1Res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({
          items: [{ productId: testProductId, quantity: 2, unitPrice: 55.0 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 110.0,
        }),
      });
      if (sale1Res.status !== 201) throw new Error(`Sale 1 checkout failed: ${sale1Res.status}`);
      const sale1 = await sale1Res.json();

      // Cashier 2 makes a sale
      const sale2Res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cashier2Token}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({
          items: [{ productId: testProductId, quantity: 1, unitPrice: 55.0 }],
          paymentMethod: PaymentMethod.TELEBIRR,
          amountPaid: 55.0,
        }),
      });
      if (sale2Res.status !== 201) throw new Error(`Sale 2 checkout failed: ${sale2Res.status}`);
      const sale2 = await sale2Res.json();

      // Cashier 1 queries sales list
      const c1SalesRes = await fetch(`${serverUrl}/api/v1/sales`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      const c1Sales = await c1SalesRes.json();
      const hasSale2 = c1Sales.some((s: any) => s.id === sale2.id);
      if (hasSale2) {
        throw new Error("VULNERABILITY: Cashier 1 can see Cashier 2's sales in list!");
      }

      // Cashier 1 tries to access Cashier 2's specific receipt
      const directReceiptRes = await fetch(`${serverUrl}/api/v1/sales/${sale2.id}`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      if (directReceiptRes.status !== 403) {
        throw new Error(`Expected HTTP 403 when viewing another cashier's receipt, got ${directReceiptRes.status}`);
      }

      // Verify costPriceSnapshot is stripped from Cashier 1's own receipt output
      const c1OwnReceipt = await fetch(`${serverUrl}/api/v1/sales/${sale1.id}`, {
        headers: {
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
      });
      const ownReceiptData = await c1OwnReceipt.json();
      for (const item of ownReceiptData.items || []) {
        if (item.costPriceSnapshot !== undefined && item.costPriceSnapshot !== null) {
          throw new Error('VULNERABILITY: costPriceSnapshot leaked to Cashier in sale receipt!');
        }
      }
    });

    // ------------------------------------------------------------------
    // TEST 5: Cashier cannot modify business settings (HTTP 403)
    // ------------------------------------------------------------------
    await test('5. Cashier cannot modify business settings (HTTP 403)', async () => {
      const res = await fetch(`${serverUrl}/api/v1/business/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({ name: 'Hacked Store Name' }),
      });
      if (res.status !== 403) {
        throw new Error(`Expected HTTP 403, got ${res.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 6: Inventory staff cannot access financial reports (HTTP 403)
    // ------------------------------------------------------------------
    await test('6. Inventory staff cannot access financial reports (HTTP 403)', async () => {
      const res = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: {
          Authorization: `Bearer ${invStaffToken}`,
          'x-organization-id': businessId,
        },
      });
      if (res.status !== 403) {
        throw new Error(`Expected HTTP 403, got ${res.status}`);
      }

      // Inventory staff can access inventory-summary
      const invSumRes = await fetch(`${serverUrl}/api/v1/reports/inventory-summary`, {
        headers: {
          Authorization: `Bearer ${invStaffToken}`,
          'x-organization-id': businessId,
        },
      });
      if (invSumRes.status !== 200) {
        throw new Error(`Expected HTTP 200 on inventory summary, got ${invSumRes.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 7: Inventory staff cannot modify business financial settings (HTTP 403)
    // ------------------------------------------------------------------
    await test('7. Inventory staff cannot modify business financial settings (HTTP 403)', async () => {
      const res = await fetch(`${serverUrl}/api/v1/business/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${invStaffToken}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({ taxRate: 0.05 }),
      });
      if (res.status !== 403) {
        throw new Error(`Expected HTTP 403, got ${res.status}`);
      }

      // Inventory staff cannot perform POS checkout
      const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${invStaffToken}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({
          items: [{ productId: testProductId, quantity: 1, unitPrice: 55.0 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 55.0,
        }),
      });
      if (checkoutRes.status !== 403) {
        throw new Error(`Expected HTTP 403 on checkout for inventory staff, got ${checkoutRes.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 8: Manager cannot perform owner-only operations (HTTP 403)
    // ------------------------------------------------------------------
    await test('8. Manager cannot perform owner-only operations (HTTP 403)', async () => {
      // 8a. Manager cannot modify settings
      const setRes = await fetch(`${serverUrl}/api/v1/business/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({ name: 'Manager Renamed Shop' }),
      });
      if (setRes.status !== 403) {
        throw new Error(`Expected HTTP 403 for manager updating settings, got ${setRes.status}`);
      }

      // 8b. Manager cannot change member roles
      const roleRes = await fetch(`${serverUrl}/api/v1/business/members/${cashier1MemberId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({ role: 'owner' }),
      });
      if (roleRes.status !== 403) {
        throw new Error(`Expected HTTP 403 for manager updating member role, got ${roleRes.status}`);
      }

      // 8c. Manager cannot deactivate members
      const statRes = await fetch(`${serverUrl}/api/v1/business/members/${cashier1MemberId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({ status: MemberStatus.DEACTIVATED }),
      });
      if (statRes.status !== 403) {
        throw new Error(`Expected HTTP 403 for manager deactivating member, got ${statRes.status}`);
      }

      // 8d. Manager CAN access operational dashboard, but gross profit and inventory valuation are sanitized
      const mgrDashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: {
          Authorization: `Bearer ${managerToken}`,
          'x-organization-id': businessId,
        },
      });
      if (mgrDashRes.status !== 200) {
        throw new Error(`Expected HTTP 200 for manager dashboard, got ${mgrDashRes.status}`);
      }
      const mgrDashData = await mgrDashRes.json();
      if (mgrDashData.kpi?.grossProfitMonth !== undefined && mgrDashData.kpi?.grossProfitMonth !== null) {
        throw new Error('VULNERABILITY: Manager dashboard leaked grossProfitMonth!');
      }
      if (mgrDashData.kpi?.inventoryValuation !== undefined && mgrDashData.kpi?.inventoryValuation !== null) {
        throw new Error('VULNERABILITY: Manager dashboard leaked inventoryValuation!');
      }
    });

    // ------------------------------------------------------------------
    // TEST 9: Owner can access permitted operations (HTTP 200)
    // ------------------------------------------------------------------
    await test('9. Owner can access permitted operations (HTTP 200)', async () => {
      // 9a. Full dashboard with financial KPIs
      const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'x-organization-id': businessId,
        },
      });
      if (dashRes.status !== 200) throw new Error(`Expected HTTP 200, got ${dashRes.status}`);
      const dashData = await dashRes.json();
      if (dashData.kpi?.grossProfitMonth === undefined) {
        throw new Error('Owner dashboard missing grossProfitMonth KPI');
      }

      // 9b. View members
      const memRes = await fetch(`${serverUrl}/api/v1/business/members`, {
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'x-organization-id': businessId,
        },
      });
      if (memRes.status !== 200) throw new Error(`Expected HTTP 200 on members, got ${memRes.status}`);

      // 9c. Update settings
      const setRes = await fetch(`${serverUrl}/api/v1/business/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({ receiptHeader: 'Welcome to Bole Supermarket!' }),
      });
      if (setRes.status !== 200) throw new Error(`Expected HTTP 200 on settings update, got ${setRes.status}`);

      // 9d. Products with cost price
      const prodRes = await fetch(`${serverUrl}/api/v1/products/${testProductId}`, {
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'x-organization-id': businessId,
        },
      });
      const prod = await prodRes.json();
      if (Number(prod.costPrice) !== 40.0) {
        throw new Error(`Owner should see wholesale costPrice 40.0, got ${prod.costPrice}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 10: Non-members cannot access business (HTTP 403)
    // ------------------------------------------------------------------
    await test('10. Non-members cannot access business (HTTP 403)', async () => {
      const res = await fetch(`${serverUrl}/api/v1/products`, {
        headers: {
          Authorization: `Bearer ${nonMemberToken}`,
          'x-organization-id': businessId,
        },
      });
      if (res.status !== 403) {
        throw new Error(`Expected HTTP 403 for non-member, got ${res.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 11: Deactivated members remain blocked (HTTP 403)
    // ------------------------------------------------------------------
    await test('11. Deactivated members remain blocked (HTTP 403)', async () => {
      // Owner deactivates Cashier 2
      await prisma.member.update({
        where: { id: cashier2MemberId },
        data: { status: MemberStatus.DEACTIVATED },
      });

      const res = await fetch(`${serverUrl}/api/v1/products`, {
        headers: {
          Authorization: `Bearer ${cashier2Token}`,
          'x-organization-id': businessId,
        },
      });
      if (res.status !== 403) {
        throw new Error(`Expected HTTP 403 for deactivated member, got ${res.status}`);
      }

      // Attempt POS checkout while deactivated
      const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cashier2Token}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({
          items: [{ productId: testProductId, quantity: 1, unitPrice: 55.0 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 55.0,
        }),
      });
      if (checkoutRes.status !== 403) {
        throw new Error(`Expected HTTP 403 on checkout for deactivated cashier, got ${checkoutRes.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 12: Role permissions mapping matches expected capabilities
    // ------------------------------------------------------------------
    await test('12. Role permissions mapping matches expected capabilities', async () => {
      // Cashier
      if (roleHasPermission(AppRole.CASHIER, AppPermission.REPORTS_VIEW_FINANCIAL)) {
        throw new Error('Cashier should NOT have REPORTS_VIEW_FINANCIAL');
      }
      if (roleHasPermission(AppRole.CASHIER, AppPermission.PRODUCTS_VIEW_COST_PRICE)) {
        throw new Error('Cashier should NOT have PRODUCTS_VIEW_COST_PRICE');
      }
      if (!roleHasPermission(AppRole.CASHIER, AppPermission.POS_CHECKOUT)) {
        throw new Error('Cashier should have POS_CHECKOUT');
      }

      // Inventory Staff
      if (roleHasPermission(AppRole.INVENTORY_STAFF, AppPermission.REPORTS_VIEW_FINANCIAL)) {
        throw new Error('Inventory staff should NOT have REPORTS_VIEW_FINANCIAL');
      }
      if (roleHasPermission(AppRole.INVENTORY_STAFF, AppPermission.POS_CHECKOUT)) {
        throw new Error('Inventory staff should NOT have POS_CHECKOUT');
      }
      if (!roleHasPermission(AppRole.INVENTORY_STAFF, AppPermission.INVENTORY_ADJUST)) {
        throw new Error('Inventory staff should have INVENTORY_ADJUST');
      }

      // Manager
      if (roleHasPermission(AppRole.MANAGER, AppPermission.SETTINGS_MANAGE)) {
        throw new Error('Manager should NOT have SETTINGS_MANAGE (owner only)');
      }
      if (!roleHasPermission(AppRole.MANAGER, AppPermission.EXPENSES_MANAGE)) {
        throw new Error('Manager should have EXPENSES_MANAGE');
      }

      // Owner
      if (!roleHasPermission(AppRole.OWNER, AppPermission.SETTINGS_MANAGE)) {
        throw new Error('Owner should have SETTINGS_MANAGE');
      }
      if (!roleHasPermission(AppRole.OWNER, AppPermission.REPORTS_VIEW_FINANCIAL)) {
        throw new Error('Owner should have REPORTS_VIEW_FINANCIAL');
      }
    });

    // ------------------------------------------------------------------
    // TEST 13: Direct URL access backend enforcement
    // ------------------------------------------------------------------
    await test('13. Direct URL access backend enforcement across protected endpoints', async () => {
      const protectedEndpoints = [
        { path: '/api/v1/expenses', method: 'GET', token: cashier1Token, expected: 403 },
        { path: '/api/v1/purchases', method: 'GET', token: cashier1Token, expected: 403 },
        { path: '/api/v1/purchases/suppliers', method: 'GET', token: cashier1Token, expected: 403 },
        { path: '/api/v1/inventory', method: 'GET', token: cashier1Token, expected: 403 },
        { path: '/api/v1/inventory/movements', method: 'GET', token: cashier1Token, expected: 403 },
        { path: '/api/v1/reports/dashboard', method: 'GET', token: invStaffToken, expected: 403 },
      ];

      for (const ep of protectedEndpoints) {
        const res = await fetch(`${serverUrl}${ep.path}`, {
          method: ep.method,
          headers: {
            Authorization: `Bearer ${ep.token}`,
            'x-organization-id': businessId,
          },
        });
        if (res.status !== ep.expected) {
          throw new Error(`Endpoint ${ep.path} expected HTTP ${ep.expected}, got ${res.status}`);
        }
      }
    });

    // ------------------------------------------------------------------
    // TEST 14: Platform admin without business membership blocked from business finances
    // ------------------------------------------------------------------
    await test('14. Platform admin without business membership blocked from business finances (HTTP 403)', async () => {
      const res = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: {
          Authorization: `Bearer ${platAdminToken}`,
          'x-organization-id': businessId,
        },
      });
      if (res.status !== 403) {
        throw new Error(`Expected HTTP 403 for platform admin without membership, got ${res.status}`);
      }

      const expRes = await fetch(`${serverUrl}/api/v1/expenses`, {
        headers: {
          Authorization: `Bearer ${platAdminToken}`,
          'x-organization-id': businessId,
        },
      });
      if (expRes.status !== 403) {
        throw new Error(`Expected HTTP 403 for platform admin on expenses, got ${expRes.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 15: POS & Inventory Transaction Integrity (Atomic Checkout Regression)
    // ------------------------------------------------------------------
    await test('15. POS & inventory atomic checkout regression test', async () => {
      // Check initial inventory
      const initialInv = await prisma.inventory.findFirst({
        where: { productId: testProductId },
      });
      const initialStock = Number(initialInv?.quantityOnHand || 0);

      // Perform checkout of 3 units
      const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cashier1Token}`,
          'x-organization-id': businessId,
        },
        body: JSON.stringify({
          items: [{ productId: testProductId, quantity: 3, unitPrice: 55.0 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 165.0,
        }),
      });

      if (checkoutRes.status !== 201) {
        throw new Error(`Checkout failed: ${checkoutRes.status} ${await checkoutRes.text()}`);
      }

      const saleData = await checkoutRes.json();
      if (!saleData.receiptNumber) throw new Error('Checkout did not return receiptNumber');
      if (saleData.status !== 'COMPLETED') throw new Error(`Sale status is not COMPLETED: ${saleData.status}`);

      // Verify stock was atomically deducted
      const updatedInv = await prisma.inventory.findFirst({
        where: { productId: testProductId },
      });
      const expectedStock = initialStock - 3;
      if (Number(updatedInv?.quantityOnHand) !== expectedStock) {
        throw new Error(`Inventory deduction failed: expected ${expectedStock}, got ${updatedInv?.quantityOnHand}`);
      }

      // Verify append-only inventory movement was created
      const movement = await prisma.inventoryMovement.findFirst({
        where: {
          productId: testProductId,
          organizationId: businessId,
          type: 'SALE',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!movement || Number(movement.quantity) !== -3) {
        throw new Error(`Inventory movement was not logged correctly: quantity=${movement?.quantity}`);
      }
    });

  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    await app.close();
  }

  // ------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('  TEST SUMMARY');
  console.log('========================================================================');
  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter((r) => r.status === 'FAILED')) {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  } else {
    console.log('🎉 ALL 15 PHASE 2 SECURITY & RBAC TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
