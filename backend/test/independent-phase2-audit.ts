import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { MemberStatus, PaymentMethod } from '@prisma/client';
import { AppRole, AppPermission, roleHasPermission } from '../src/common/auth/permissions';

async function runIndependentAudit() {
  console.log('=================================================================================');
  console.log('   DUKAFLOW INDEPENDENT PHASE 2 RBAC & SECURITY AUDIT TEST SUITE');
  console.log('=================================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const testPort = 5995;
  await app.listen(testPort);
  const serverUrl = `http://localhost:${testPort}`;
  const prisma = app.get(PrismaService);

  const ts = Date.now();
  const password = 'AuditSecurePassword2026!';

  const results: {
    section: string;
    name: string;
    status: 'PASSED' | 'FAILED';
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    error?: string;
  }[] = [];

  async function auditTest(
    section: string,
    name: string,
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    fn: () => Promise<void>,
  ) {
    process.stdout.write(`[${section}] ${name}... `);
    try {
      await fn();
      results.push({ section, name, status: 'PASSED' });
      console.log('✅ PASSED');
    } catch (err: any) {
      results.push({ section, name, status: 'FAILED', severity, error: err.message || String(err) });
      console.log(`❌ FAILED (${severity}): ${err.message || String(err)}`);
    }
  }

  async function registerUser(name: string, email: string) {
    const res = await fetch(`${serverUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (res.status !== 201) {
      throw new Error(`Register failed for ${email}: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return { token: data.token, user: data.user };
  }

  try {
    // ==================================================================
    // PROVISION TENANT A & TENANT B
    // ==================================================================
    console.log('--- Setting up Tenant A & Tenant B with multi-role accounts ---');
    // Tenant A users
    const ownerA = await registerUser('Owner A', `ownerA_${ts}@dukaflow.et`);
    const managerA = await registerUser('Manager A', `managerA_${ts}@dukaflow.et`);
    const cashierA = await registerUser('Cashier A', `cashierA_${ts}@dukaflow.et`);
    const invStaffA = await registerUser('InvStaff A', `invstaffA_${ts}@dukaflow.et`);
    const invitedUserA = await registerUser('Invited User A', `invitedA_${ts}@dukaflow.et`);
    const deactivatedCashierA = await registerUser('Deactivated Cashier A', `deactA_${ts}@dukaflow.et`);

    // Tenant B users
    const ownerB = await registerUser('Owner B', `ownerB_${ts}@dukaflow.et`);
    const cashierB = await registerUser('Cashier B', `cashierB_${ts}@dukaflow.et`);

    // Platform admin (no tenant membership)
    const platAdmin = await registerUser('Platform Admin', `platadmin_${ts}@dukaflow.et`);

    // Onboard Tenant A
    const onboardARes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerA.token}` },
      body: JSON.stringify({ name: `Tenant A Bole Mart ${ts}`, city: 'Addis Ababa', currency: 'ETB' }),
    });
    const orgAId = (await onboardARes.json()).business.id;

    // Onboard Tenant B
    const onboardBRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerB.token}` },
      body: JSON.stringify({ name: `Tenant B Piassa Supermarket ${ts}`, city: 'Addis Ababa', currency: 'ETB' }),
    });
    const orgBId = (await onboardBRes.json()).business.id;

    // Provision memberships in Tenant A
    const memManagerA = await prisma.member.create({
      data: { organizationId: orgAId, userId: managerA.user.id, role: 'manager', status: MemberStatus.ACTIVE },
    });
    const memCashierA = await prisma.member.create({
      data: { organizationId: orgAId, userId: cashierA.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });
    const memInvStaffA = await prisma.member.create({
      data: { organizationId: orgAId, userId: invStaffA.user.id, role: 'inventory_staff', status: MemberStatus.ACTIVE },
    });
    const memInvitedA = await prisma.member.create({
      data: { organizationId: orgAId, userId: invitedUserA.user.id, role: 'cashier', status: MemberStatus.INVITED },
    });
    const memDeactivatedA = await prisma.member.create({
      data: { organizationId: orgAId, userId: deactivatedCashierA.user.id, role: 'cashier', status: MemberStatus.DEACTIVATED },
    });

    // Provision memberships in Tenant B
    const memCashierB = await prisma.member.create({
      data: { organizationId: orgBId, userId: cashierB.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
    });

    // Provision Products for Tenant A and Tenant B
    const prodARes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgAId },
      body: JSON.stringify({
        name: 'Tenant A Coffee 500g',
        sku: `COFFEE-A-${ts}`,
        costPrice: 150.0,
        sellingPrice: 220.0,
        initialStock: 50,
        minStockThreshold: 5,
        unit: 'pcs',
      }),
    });
    const prodAId = (await prodARes.json()).id;

    const prodBRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerB.token}`, 'x-organization-id': orgBId },
      body: JSON.stringify({
        name: 'Tenant B Tea 100g',
        sku: `TEA-B-${ts}`,
        costPrice: 40.0,
        sellingPrice: 65.0,
        initialStock: 30,
        minStockThreshold: 5,
        unit: 'pcs',
      }),
    });
    const prodBId = (await prodBRes.json()).id;

    // Record an Expense in Tenant A
    const expARes = await fetch(`${serverUrl}/api/v1/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgAId },
      body: JSON.stringify({
        category: 'Rent',
        amount: 12000,
        description: 'Bole Store Monthly Rent',
        paymentMethod: 'BANK_TRANSFER',
        date: new Date().toISOString(),
      }),
    });
    const expAId = (await expARes.json()).id;

    // Record an Expense in Tenant B
    const expBRes = await fetch(`${serverUrl}/api/v1/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerB.token}`, 'x-organization-id': orgBId },
      body: JSON.stringify({
        category: 'Utilities',
        amount: 3500,
        description: 'Piassa Electric Bill',
        paymentMethod: 'CASH',
        date: new Date().toISOString(),
      }),
    });
    const expBId = (await expBRes.json()).id;

    // Record a Purchase in Tenant A
    const supARes = await fetch(`${serverUrl}/api/v1/purchases/suppliers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgAId },
      body: JSON.stringify({ name: `Tenant A Roasters PLC ${ts}`, phoneNumber: '0911000001' }),
    });
    const supAId = (await supARes.json()).id;

    const poARes = await fetch(`${serverUrl}/api/v1/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgAId },
      body: JSON.stringify({
        supplierId: supAId,
        items: [{ productId: prodAId, orderedQty: 20, unitCost: 145.0 }],
        notes: 'Urgent restocking',
      }),
    });
    const poAId = (await poARes.json()).id;

    // Record a Sale in Tenant A by Cashier A
    const saleARes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      body: JSON.stringify({
        items: [{ productId: prodAId, quantity: 2, unitPrice: 220.0 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 440.0,
      }),
    });
    const saleAId = (await saleARes.json()).id;

    // Record a Sale in Tenant B by Cashier B
    const saleBRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierB.token}`, 'x-organization-id': orgBId },
      body: JSON.stringify({
        items: [{ productId: prodBId, quantity: 1, unitPrice: 65.0 }],
        paymentMethod: PaymentMethod.TELEBIRR,
        amountPaid: 65.0,
      }),
    });
    const saleBId = (await saleBRes.json()).id;

    console.log(`Provisioning completed.\nTenant A: ${orgAId} | Tenant B: ${orgBId}\n`);

    // ==================================================================
    // 1. PERMISSION MATRIX AUDIT
    // ==================================================================
    await auditTest('1. Permission Matrix', 'Verify OWNER has full business permissions', 'HIGH', async () => {
      const required = [
        AppPermission.REPORTS_VIEW_FINANCIAL,
        AppPermission.REPORTS_VIEW_OPERATIONAL,
        AppPermission.PRODUCTS_VIEW,
        AppPermission.PRODUCTS_VIEW_COST_PRICE,
        AppPermission.PRODUCTS_MANAGE,
        AppPermission.INVENTORY_VIEW,
        AppPermission.INVENTORY_ADJUST,
        AppPermission.POS_CHECKOUT,
        AppPermission.SALES_VIEW_ALL,
        AppPermission.SALES_VIEW_COST_PRICE,
        AppPermission.PURCHASES_VIEW,
        AppPermission.PURCHASES_MANAGE,
        AppPermission.PURCHASES_RECEIVE,
        AppPermission.EXPENSES_VIEW,
        AppPermission.EXPENSES_MANAGE,
        AppPermission.SETTINGS_MANAGE,
        AppPermission.STAFF_MANAGE,
      ];
      for (const p of required) {
        if (!roleHasPermission(AppRole.OWNER, p)) {
          throw new Error(`Owner is missing permission: ${p}`);
        }
      }
    });

    await auditTest('1. Permission Matrix', 'Verify MANAGER permissions (operational only, no owner actions)', 'HIGH', async () => {
      // Must NOT have owner-only permissions
      if (roleHasPermission(AppRole.MANAGER, AppPermission.SETTINGS_MANAGE)) {
        throw new Error('Manager has excessive permission: SETTINGS_MANAGE');
      }
      if (roleHasPermission(AppRole.MANAGER, AppPermission.STAFF_MANAGE)) {
        throw new Error('Manager has excessive permission: STAFF_MANAGE');
      }
      if (roleHasPermission(AppRole.MANAGER, AppPermission.REPORTS_VIEW_FINANCIAL)) {
        throw new Error('Manager has excessive permission: REPORTS_VIEW_FINANCIAL');
      }
      // Must have operational permissions
      if (!roleHasPermission(AppRole.MANAGER, AppPermission.EXPENSES_VIEW)) {
        throw new Error('Manager missing EXPENSES_VIEW');
      }
      if (!roleHasPermission(AppRole.MANAGER, AppPermission.SALES_VIEW_ALL)) {
        throw new Error('Manager missing SALES_VIEW_ALL');
      }
    });

    await auditTest('1. Permission Matrix', 'Verify CASHIER permissions (POS only, no financial/cost data)', 'CRITICAL', async () => {
      const denied = [
        AppPermission.PRODUCTS_VIEW_COST_PRICE,
        AppPermission.SALES_VIEW_COST_PRICE,
        AppPermission.SALES_VIEW_ALL,
        AppPermission.REPORTS_VIEW_FINANCIAL,
        AppPermission.EXPENSES_VIEW,
        AppPermission.EXPENSES_MANAGE,
        AppPermission.PURCHASES_VIEW,
        AppPermission.PURCHASES_MANAGE,
        AppPermission.INVENTORY_VIEW,
        AppPermission.INVENTORY_ADJUST,
        AppPermission.SETTINGS_MANAGE,
        AppPermission.STAFF_MANAGE,
      ];
      for (const p of denied) {
        if (roleHasPermission(AppRole.CASHIER, p)) {
          throw new Error(`Cashier has excessive permission: ${p}`);
        }
      }
      // Cashier must have POS_CHECKOUT and PRODUCTS_VIEW
      if (!roleHasPermission(AppRole.CASHIER, AppPermission.POS_CHECKOUT)) {
        throw new Error('Cashier missing POS_CHECKOUT');
      }
      if (!roleHasPermission(AppRole.CASHIER, AppPermission.PRODUCTS_VIEW)) {
        throw new Error('Cashier missing PRODUCTS_VIEW');
      }
    });

    await auditTest('1. Permission Matrix', 'Verify INVENTORY_STAFF permissions (stock only, no sales/finances)', 'HIGH', async () => {
      const denied = [
        AppPermission.POS_CHECKOUT,
        AppPermission.SALES_VIEW_ALL,
        AppPermission.SALES_VIEW_OWN,
        AppPermission.REPORTS_VIEW_FINANCIAL,
        AppPermission.EXPENSES_VIEW,
        AppPermission.EXPENSES_MANAGE,
        AppPermission.SETTINGS_MANAGE,
        AppPermission.STAFF_MANAGE,
      ];
      for (const p of denied) {
        if (roleHasPermission(AppRole.INVENTORY_STAFF, p)) {
          throw new Error(`Inventory staff has excessive permission: ${p}`);
        }
      }
      if (!roleHasPermission(AppRole.INVENTORY_STAFF, AppPermission.INVENTORY_VIEW)) {
        throw new Error('Inventory staff missing INVENTORY_VIEW');
      }
      if (!roleHasPermission(AppRole.INVENTORY_STAFF, AppPermission.PURCHASES_RECEIVE)) {
        throw new Error('Inventory staff missing PURCHASES_RECEIVE');
      }
    });

    // ==================================================================
    // 2. FINANCIAL INFORMATION AUDIT FOR CASHIER
    // ==================================================================
    await auditTest('2. Financial Audit', 'Cashier cannot obtain costPrice from GET /products', 'CRITICAL', async () => {
      const res = await fetch(`${serverUrl}/api/v1/products`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const p = body.find((i: any) => i.id === prodAId);
      if (p.costPrice !== undefined && p.costPrice !== null) {
        throw new Error(`CRITICAL: costPrice exposed in product list: ${p.costPrice}`);
      }
    });

    await auditTest('2. Financial Audit', 'Cashier cannot obtain costPrice from GET /products/:id', 'CRITICAL', async () => {
      const res = await fetch(`${serverUrl}/api/v1/products/${prodAId}`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (body.costPrice !== undefined && body.costPrice !== null) {
        throw new Error(`CRITICAL: costPrice exposed in single product lookup: ${body.costPrice}`);
      }
    });

    await auditTest('2. Financial Audit', 'Cashier cannot obtain costPrice from GET /products/lookup', 'CRITICAL', async () => {
      const res = await fetch(`${serverUrl}/api/v1/products/lookup?code=COFFEE-A-${ts}`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (body.costPrice !== undefined && body.costPrice !== null) {
        throw new Error(`CRITICAL: costPrice exposed in barcode lookup: ${body.costPrice}`);
      }
    });

    await auditTest('2. Financial Audit', 'Cashier cannot obtain costPriceSnapshot from POST /sales/checkout', 'CRITICAL', async () => {
      const res = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({
          items: [{ productId: prodAId, quantity: 1, unitPrice: 220.0 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 220.0,
        }),
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      const body = await res.json();
      for (const item of body.items || []) {
        if (item.costPriceSnapshot !== undefined && item.costPriceSnapshot !== null) {
          throw new Error(`CRITICAL: costPriceSnapshot exposed in checkout response: ${item.costPriceSnapshot}`);
        }
      }
    });

    await auditTest('2. Financial Audit', 'Cashier cannot obtain costPriceSnapshot from GET /sales', 'CRITICAL', async () => {
      const res = await fetch(`${serverUrl}/api/v1/sales`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      for (const sale of body) {
        for (const item of sale.items || []) {
          if (item.costPriceSnapshot !== undefined && item.costPriceSnapshot !== null) {
            throw new Error(`CRITICAL: costPriceSnapshot exposed in sales list: ${item.costPriceSnapshot}`);
          }
        }
      }
    });

    await auditTest('2. Financial Audit', 'Cashier cannot obtain costPriceSnapshot from GET /sales/:id', 'CRITICAL', async () => {
      const res = await fetch(`${serverUrl}/api/v1/sales/${saleAId}`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      for (const item of body.items || []) {
        if (item.costPriceSnapshot !== undefined && item.costPriceSnapshot !== null) {
          throw new Error(`CRITICAL: costPriceSnapshot exposed in single sale receipt: ${item.costPriceSnapshot}`);
        }
      }
    });

    await auditTest('2. Financial Audit', 'Cashier cannot access gross or net profit (HTTP 403 on /reports/dashboard)', 'CRITICAL', async () => {
      const res = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    });

    await auditTest('2. Financial Audit', 'Cashier cannot access sales trend chart (HTTP 403 on /charts/daily-sales)', 'HIGH', async () => {
      const res = await fetch(`${serverUrl}/api/v1/reports/charts/daily-sales`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    });

    await auditTest('2. Financial Audit', 'Cashier cannot access business expenses (HTTP 403 on /expenses)', 'HIGH', async () => {
      const res = await fetch(`${serverUrl}/api/v1/expenses`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden on GET /expenses, got ${res.status}`);

      const postRes = await fetch(`${serverUrl}/api/v1/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({ category: 'Rent', amount: 1000 }),
      });
      if (postRes.status !== 403) throw new Error(`Expected 403 Forbidden on POST /expenses, got ${postRes.status}`);
    });

    await auditTest('2. Financial Audit', 'Cashier cannot access purchase costs or suppliers (HTTP 403 on /purchases)', 'HIGH', async () => {
      const poRes = await fetch(`${serverUrl}/api/v1/purchases`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (poRes.status !== 403) throw new Error(`Expected 403 on GET /purchases, got ${poRes.status}`);

      const supRes = await fetch(`${serverUrl}/api/v1/purchases/suppliers`, {
        headers: { Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
      });
      if (supRes.status !== 403) throw new Error(`Expected 403 on GET /purchases/suppliers, got ${supRes.status}`);
    });

    // ==================================================================
    // 3. TENANT ISOLATION AUDIT (CROSS-TENANT ATTACK SIMULATION)
    // ==================================================================
    await auditTest('3. Tenant Isolation', 'Tenant A User querying Tenant B with x-organization-id (HTTP 403)', 'CRITICAL', async () => {
      // Owner A attempts to access Tenant B products using Tenant B's org ID
      const res = await fetch(`${serverUrl}/api/v1/products`, {
        headers: { Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgBId },
      });
      if (res.status !== 403) {
        throw new Error(`CRITICAL TENANT LEAK: User A accessed Tenant B products! Status: ${res.status}`);
      }

      // Owner A attempts to access Tenant B sales
      const saleRes = await fetch(`${serverUrl}/api/v1/sales`, {
        headers: { Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgBId },
      });
      if (saleRes.status !== 403) {
        throw new Error(`CRITICAL TENANT LEAK: User A accessed Tenant B sales! Status: ${saleRes.status}`);
      }

      // Owner A attempts to access Tenant B expenses
      const expRes = await fetch(`${serverUrl}/api/v1/expenses`, {
        headers: { Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgBId },
      });
      if (expRes.status !== 403) {
        throw new Error(`CRITICAL TENANT LEAK: User A accessed Tenant B expenses! Status: ${expRes.status}`);
      }

      // Owner A attempts to access Tenant B reports
      const repRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: { Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgBId },
      });
      if (repRes.status !== 403) {
        throw new Error(`CRITICAL TENANT LEAK: User A accessed Tenant B reports! Status: ${repRes.status}`);
      }

      // Owner A attempts to access Tenant B members
      const memRes = await fetch(`${serverUrl}/api/v1/business/members`, {
        headers: { Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgBId },
      });
      if (memRes.status !== 403) {
        throw new Error(`CRITICAL TENANT LEAK: User A accessed Tenant B members! Status: ${memRes.status}`);
      }

      // Owner A attempts to update Tenant B settings
      const setRes = await fetch(`${serverUrl}/api/v1/business/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgBId },
        body: JSON.stringify({ name: 'Tampered Tenant B' }),
      });
      if (setRes.status !== 403) {
        throw new Error(`CRITICAL TENANT LEAK: User A updated Tenant B settings! Status: ${setRes.status}`);
      }
    });

    await auditTest('3. Tenant Isolation', 'Tenant A User IDOR: passing Tenant B resource ID with Tenant A org (HTTP 404)', 'CRITICAL', async () => {
      // 1. Cross-tenant product inspection
      const prodRes = await fetch(`${serverUrl}/api/v1/products/${prodBId}`, {
        headers: { Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgAId },
      });
      if (prodRes.status !== 404) {
        throw new Error(`IDOR LEAK: Owner A accessed Tenant B product: status ${prodRes.status}`);
      }

      // 2. Cross-tenant sale inspection
      const saleRes = await fetch(`${serverUrl}/api/v1/sales/${saleBId}`, {
        headers: { Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgAId },
      });
      if (saleRes.status !== 404) {
        throw new Error(`IDOR LEAK: Owner A accessed Tenant B sale: status ${saleRes.status}`);
      }

      // 3. Cross-tenant member role modification
      const roleRes = await fetch(`${serverUrl}/api/v1/business/members/${memCashierB.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({ role: 'manager' }),
      });
      if (roleRes.status !== 404) {
        throw new Error(`IDOR LEAK: Owner A altered Tenant B member role: status ${roleRes.status}`);
      }

      // 4. Cross-tenant stock receive attempt
      const receiveRes = await fetch(`${serverUrl}/api/v1/purchases/${poAId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerB.token}`, 'x-organization-id': orgBId },
        body: JSON.stringify({ receivedItems: [{ purchaseItemId: 'dummy-line-id', receivedQty: 1 }] }),
      });
      if (receiveRes.status !== 404) {
        throw new Error(`IDOR LEAK: Owner B accessed Tenant A purchase: status ${receiveRes.status}`);
      }
    });

    // ==================================================================
    // 4. DIRECT API AUTHORIZATION & ROLE PRIVILEGE AUDIT
    // ==================================================================
    await auditTest('4. Direct Authorization', 'Manager cannot perform owner-only actions', 'HIGH', async () => {
      // 1. Modify business settings (403)
      const setRes = await fetch(`${serverUrl}/api/v1/business/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({ name: 'Manager New Name' }),
      });
      if (setRes.status !== 403) throw new Error(`Manager updating settings: expected 403, got ${setRes.status}`);

      // 2. Modify staff role (403)
      const roleRes = await fetch(`${serverUrl}/api/v1/business/members/${memCashierA.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({ role: 'owner' }),
      });
      if (roleRes.status !== 403) throw new Error(`Manager updating staff role: expected 403, got ${roleRes.status}`);

      // 3. Deactivate staff member (403)
      const statRes = await fetch(`${serverUrl}/api/v1/business/members/${memCashierA.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({ status: MemberStatus.DEACTIVATED }),
      });
      if (statRes.status !== 403) throw new Error(`Manager deactivating staff: expected 403, got ${statRes.status}`);

      // 4. Manager dashboard must mask gross profit and stock valuation
      const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: { Authorization: `Bearer ${managerA.token}`, 'x-organization-id': orgAId },
      });
      if (dashRes.status !== 200) throw new Error(`Manager dashboard expected 200, got ${dashRes.status}`);
      const dashBody = await dashRes.json();
      if (dashBody.grossProfitMonth !== undefined && dashBody.grossProfitMonth !== null) {
        throw new Error('Manager dashboard leaked grossProfitMonth');
      }
      if (dashBody.inventoryValuation !== undefined && dashBody.inventoryValuation !== null) {
        throw new Error('Manager dashboard leaked inventoryValuation');
      }
    });

    await auditTest('4. Direct Authorization', 'Inventory staff cannot access financial reports or POS checkout', 'HIGH', async () => {
      // 1. Dashboard financial report (403)
      const dashRes = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: { Authorization: `Bearer ${invStaffA.token}`, 'x-organization-id': orgAId },
      });
      if (dashRes.status !== 403) throw new Error(`Inventory staff on /reports/dashboard: expected 403, got ${dashRes.status}`);

      // 2. POS checkout (403)
      const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${invStaffA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({
          items: [{ productId: prodAId, quantity: 1, unitPrice: 220.0 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 220.0,
        }),
      });
      if (checkoutRes.status !== 403) throw new Error(`Inventory staff on checkout: expected 403, got ${checkoutRes.status}`);

      // 3. Sales ledger (403)
      const salesRes = await fetch(`${serverUrl}/api/v1/sales`, {
        headers: { Authorization: `Bearer ${invStaffA.token}`, 'x-organization-id': orgAId },
      });
      if (salesRes.status !== 403) throw new Error(`Inventory staff on /sales: expected 403, got ${salesRes.status}`);
    });

    await auditTest('4. Direct Authorization', 'Deactivated member blocked from all business endpoints (HTTP 403)', 'CRITICAL', async () => {
      const endpoints = [
        { path: '/api/v1/products', method: 'GET' },
        { path: '/api/v1/sales', method: 'GET' },
        { path: '/api/v1/business/current', method: 'GET' },
      ];
      for (const ep of endpoints) {
        const res = await fetch(`${serverUrl}${ep.path}`, {
          method: ep.method,
          headers: { Authorization: `Bearer ${deactivatedCashierA.token}`, 'x-organization-id': orgAId },
        });
        if (res.status !== 403) {
          throw new Error(`Deactivated member accessed ${ep.path}: expected 403, got ${res.status}`);
        }
      }
    });

    await auditTest('4. Direct Authorization', 'Invited member (status=INVITED) blocked until accepted (HTTP 403)', 'HIGH', async () => {
      const res = await fetch(`${serverUrl}/api/v1/products`, {
        headers: { Authorization: `Bearer ${invitedUserA.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 403) {
        throw new Error(`Invited member accessed /products before accepting: expected 403, got ${res.status}`);
      }
    });

    await auditTest('4. Direct Authorization', 'Platform admin without membership blocked from tenant operations (HTTP 403)', 'CRITICAL', async () => {
      const res = await fetch(`${serverUrl}/api/v1/reports/dashboard`, {
        headers: { Authorization: `Bearer ${platAdmin.token}`, 'x-organization-id': orgAId },
      });
      if (res.status !== 403) {
        throw new Error(`Platform admin without membership accessed tenant dashboard: expected 403, got ${res.status}`);
      }

      const expRes = await fetch(`${serverUrl}/api/v1/expenses`, {
        headers: { Authorization: `Bearer ${platAdmin.token}`, 'x-organization-id': orgAId },
      });
      if (expRes.status !== 403) {
        throw new Error(`Platform admin without membership accessed tenant expenses: expected 403, got ${expRes.status}`);
      }
    });

    // ==================================================================
    // 5. POS AND INVENTORY REGRESSION & ATOMIC INTEGRITY
    // ==================================================================
    await auditTest('5. POS & Inventory', 'Cashier completes sale, stock decremented, movement logged', 'HIGH', async () => {
      const invBefore = await prisma.inventory.findFirst({ where: { productId: prodAId } });
      const stockBefore = Number(invBefore?.quantityOnHand || 0);

      const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({
          items: [{ productId: prodAId, quantity: 4, unitPrice: 220.0 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 880.0,
        }),
      });
      if (checkoutRes.status !== 201) throw new Error(`Checkout failed: ${checkoutRes.status}`);
      const sale = await checkoutRes.json();
      if (!sale.receiptNumber) throw new Error('Sale missing receiptNumber');

      const invAfter = await prisma.inventory.findFirst({ where: { productId: prodAId } });
      const stockAfter = Number(invAfter?.quantityOnHand || 0);
      if (stockAfter !== stockBefore - 4) {
        throw new Error(`Stock decrement failed: before=${stockBefore}, after=${stockAfter}, expected=${stockBefore - 4}`);
      }

      const movement = await prisma.inventoryMovement.findFirst({
        where: { productId: prodAId, organizationId: orgAId, type: 'SALE' },
        orderBy: { createdAt: 'desc' },
      });
      if (!movement || Number(movement.quantity) !== -4) {
        throw new Error(`Inventory movement quantity mismatch: ${movement?.quantity}`);
      }
    });

    await auditTest('5. POS & Inventory', 'Overselling blocked when allowNegative is false', 'HIGH', async () => {
      const inv = await prisma.inventory.findFirst({ where: { productId: prodAId } });
      const currentStock = Number(inv?.quantityOnHand || 0);

      const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({
          items: [{ productId: prodAId, quantity: currentStock + 999, unitPrice: 220.0 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: (currentStock + 999) * 220.0,
        }),
      });
      if (checkoutRes.status !== 400) {
        throw new Error(`Overselling was NOT blocked! Status: ${checkoutRes.status}`);
      }
    });

    await auditTest('5. POS & Inventory', 'Cashier blocked from performing manual stock adjustments (HTTP 403)', 'HIGH', async () => {
      const adjRes = await fetch(`${serverUrl}/api/v1/inventory/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierA.token}`, 'x-organization-id': orgAId },
        body: JSON.stringify({
          productId: prodAId,
          type: 'DAMAGE',
          quantity: -2,
          reason: 'Unauthorized cashier adjustment',
        }),
      });
      if (adjRes.status !== 403) {
        throw new Error(`Cashier performed stock adjustment! Status: ${adjRes.status}`);
      }
    });

  } catch (err: any) {
    console.error('Fatal audit failure:', err);
  } finally {
    await app.close();
  }

  // ==================================================================
  // AUDIT SUMMARY & VERDICT
  // ==================================================================
  console.log('\n=================================================================================');
  console.log('   INDEPENDENT AUDIT EXECUTION SUMMARY');
  console.log('=================================================================================');
  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Audit Checks: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('FAILED AUDIT CHECKS:');
    for (const r of results.filter((r) => r.status === 'FAILED')) {
      console.log(`  ❌ [${r.section}] ${r.name} (${r.severity}): ${r.error}`);
    }
    process.exit(1);
  } else {
    console.log('🏆 VERDICT: ALL INDEPENDENT SECURITY AUDIT CHECKS PASSED WITH ZERO FAILURES!\n');
    process.exit(0);
  }
}

runIndependentAudit().catch((e) => {
  console.error(e);
  process.exit(1);
});
