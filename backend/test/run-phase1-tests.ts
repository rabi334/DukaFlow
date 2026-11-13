import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { MemberStatus, PaymentMethod } from '@prisma/client';

async function main() {
  console.log('========================================================================');
  console.log('  DUKAFLOW PHASE 1: AUTHENTICATION & SECURITY VERIFICATION SUITE');
  console.log('========================================================================\n');

  // 1. Bootstrap NestJS server on dynamic test port
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

  const timestamp = Date.now();
  const testOwnerEmail = `owner_phase1_${timestamp}@dukaflow.et`;
  const testOwnerPassword = 'StrongPassword2026!';
  const intruderEmail = `intruder_phase1_${timestamp}@dukaflow.et`;

  let testOwnerToken = '';
  let testOwnerUserId = '';
  let createdBusinessId = '';
  let intruderToken = '';
  let intruderUserId = '';

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

  try {
    // ------------------------------------------------------------------
    // TEST 1: User Registration
    // ------------------------------------------------------------------
    await test('1. User Registration via POST /api/v1/auth/register', async () => {
      const res = await fetch(`${serverUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Solomon Haile',
          email: testOwnerEmail,
          password: testOwnerPassword,
        }),
      });

      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Expected HTTP 201, got ${res.status}: ${text}`);
      }

      const body = await res.json();
      if (!body.user || body.user.email !== testOwnerEmail) {
        throw new Error('Response did not return expected user payload');
      }
      testOwnerUserId = body.user.id;
      testOwnerToken = body.token;

      // Verify password is encrypted and not in plain text in database
      const account = await prisma.account.findFirst({
        where: { userId: testOwnerUserId },
      });
      if (!account || !account.password) {
        throw new Error('Account record or hashed password not found in DB');
      }
      if (account.password === testOwnerPassword) {
        throw new Error('VULNERABILITY: Password is stored in plain text!');
      }
    });

    // ------------------------------------------------------------------
    // TEST 2: User Login
    // ------------------------------------------------------------------
    await test('2. User Login via POST /api/v1/auth/login', async () => {
      const res = await fetch(`${serverUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testOwnerEmail,
          password: testOwnerPassword,
        }),
      });

      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Expected HTTP 200, got ${res.status}: ${text}`);
      }

      const body = await res.json();
      if (!body.token || !body.user) {
        throw new Error('Login response missing token or user');
      }
      testOwnerToken = body.token; // Refresh session token
    });

    // ------------------------------------------------------------------
    // TEST 3: User Logout & Session Invalidation
    // ------------------------------------------------------------------
    await test('3. User Logout revokes session and blocks subsequent requests', async () => {
      // Register a temporary user for logout
      const tempEmail = `logout_test_${Date.now()}@dukaflow.et`;
      const regRes = await fetch(`${serverUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Logout Temp',
          email: tempEmail,
          password: 'Password123!',
        }),
      });
      const regData = await regRes.json();
      const tempToken = regData.token;

      // Verify profile works before logout
      const beforeRes = await fetch(`${serverUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${tempToken}` },
      });
      if (beforeRes.status !== 200) {
        throw new Error(`Expected 200 before logout, got ${beforeRes.status}`);
      }

      // Logout
      const logoutRes = await fetch(`${serverUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tempToken}` },
      });
      if (logoutRes.status !== 200) {
        throw new Error(`Expected 200 on logout, got ${logoutRes.status}`);
      }

      // Verify request with revoked token is rejected with 401
      const afterRes = await fetch(`${serverUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${tempToken}` },
      });
      if (afterRes.status !== 401) {
        throw new Error(`Expected 401 Unauthorized with revoked token, got ${afterRes.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 4: Unauthenticated Access Rejected (401)
    // ------------------------------------------------------------------
    await test('4. Access to protected endpoint without authentication is rejected (401)', async () => {
      const res = await fetch(`${serverUrl}/api/v1/auth/me`);
      if (res.status !== 401) {
        throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 5: Invalid/Bogus Session Rejected (401)
    // ------------------------------------------------------------------
    await test('5. Invalid or forged session token is rejected (401)', async () => {
      const res = await fetch(`${serverUrl}/api/v1/auth/me`, {
        headers: { Authorization: 'Bearer invalid_forged_token_0000000000' },
      });
      if (res.status !== 401) {
        throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 6: x-user-email Cannot Impersonate Another User
    // ------------------------------------------------------------------
    await test('6. Security: x-user-email header CANNOT impersonate another user', async () => {
      const res = await fetch(`${serverUrl}/api/v1/auth/me`, {
        headers: {
          'x-user-email': testOwnerEmail,
        },
      });
      if (res.status !== 401) {
        throw new Error(`VULNERABILITY DETECTED: Endpoint accepted x-user-email without valid session! Status: ${res.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 7: x-user-id Cannot Impersonate Another User
    // ------------------------------------------------------------------
    await test('7. Security: x-user-id header CANNOT impersonate another user', async () => {
      const res = await fetch(`${serverUrl}/api/v1/auth/me`, {
        headers: {
          'x-user-id': testOwnerUserId,
        },
      });
      if (res.status !== 401) {
        throw new Error(`VULNERABILITY DETECTED: Endpoint accepted x-user-id without valid session! Status: ${res.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 8: Business Onboarding & OWNER Membership
    // ------------------------------------------------------------------
    await test('8. Business Onboarding creates Organization + OWNER membership + default categories', async () => {
      const res = await fetch(`${serverUrl}/api/v1/business/onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testOwnerToken}`,
        },
        body: JSON.stringify({
          name: `Piazza Supermarket ${timestamp}`,
          city: 'Addis Ababa',
          businessType: 'Retail',
          currency: 'ETB',
        }),
      });

      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Expected HTTP 201, got ${res.status}: ${text}`);
      }

      const body = await res.json();
      if (!body.business || !body.membership) {
        throw new Error('Onboarding response missing business or membership');
      }
      if (body.membership.role !== 'owner' || body.membership.status !== MemberStatus.ACTIVE) {
        throw new Error(`Expected role owner & ACTIVE status, got role=${body.membership.role}, status=${body.membership.status}`);
      }
      createdBusinessId = body.business.id;

      // Verify default Ethiopian categories created in DB
      const categories = await prisma.category.findMany({
        where: { organizationId: createdBusinessId },
      });
      if (categories.length < 5) {
        throw new Error(`Expected at least 5 default categories, found ${categories.length}`);
      }
      const names = categories.map((c) => c.name);
      if (!names.includes('Beverages & Drinks') || !names.includes('Dairy & Eggs')) {
        throw new Error('Default categories mismatch in database');
      }
    });

    // ------------------------------------------------------------------
    // TEST 9: Cross-Tenant Isolation (403)
    // ------------------------------------------------------------------
    await test('9. Multi-Tenancy: Non-member cannot access another business workspace (403)', async () => {
      // Register intruder user
      const regRes = await fetch(`${serverUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unauthorized User',
          email: intruderEmail,
          password: 'Password123!',
        }),
      });
      const regBody = await regRes.json();
      intruderToken = regBody.token;
      intruderUserId = regBody.user.id;

      // Intruder attempts to access owner's business
      const res = await fetch(`${serverUrl}/api/v1/business/current`, {
        headers: {
          Authorization: `Bearer ${intruderToken}`,
          'x-organization-id': createdBusinessId,
        },
      });

      if (res.status !== 403) {
        throw new Error(`VULNERABILITY: Non-member was not rejected with 403! Got: ${res.status}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 10: Deactivated Member Blocked (403)
    // ------------------------------------------------------------------
    await test('10. Member Status: Deactivated member cannot access business workspace (403)', async () => {
      // Add intruder to the business with DEACTIVATED status
      await prisma.member.create({
        data: {
          organizationId: createdBusinessId,
          userId: intruderUserId,
          role: 'cashier',
          status: MemberStatus.DEACTIVATED,
        },
      });

      const res = await fetch(`${serverUrl}/api/v1/business/current`, {
        headers: {
          Authorization: `Bearer ${intruderToken}`,
          'x-organization-id': createdBusinessId,
        },
      });

      if (res.status !== 403) {
        throw new Error(`Expected 403 for deactivated member, got: ${res.status}`);
      }
      const body = await res.json();
      if (!body.message?.toLowerCase().includes('deactivated')) {
        throw new Error(`Expected error message to mention deactivated, got: ${JSON.stringify(body)}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 11: Runtime DTO Validation (400)
    // ------------------------------------------------------------------
    await test('11. Runtime DTO Validation: Malformed payloads rejected with HTTP 400 Bad Request', async () => {
      const res = await fetch(`${serverUrl}/api/v1/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testOwnerToken}`,
          'x-organization-id': createdBusinessId,
        },
        body: JSON.stringify({
          // missing name and sku
          costPrice: -25, // invalid negative number
          sellingPrice: -50, // invalid negative number
        }),
      });

      if (res.status !== 400) {
        throw new Error(`Expected 400 Bad Request for invalid DTO, got: ${res.status}`);
      }

      const body = await res.json();
      const messageStr = JSON.stringify(body.message);
      if (!messageStr.includes('name') || !messageStr.includes('sku')) {
        throw new Error(`Expected validation messages for name and sku, got: ${messageStr}`);
      }
    });

    // ------------------------------------------------------------------
    // TEST 12: POS Checkout Atomic Transaction & Inventory Regressions Pass
    // ------------------------------------------------------------------
    await test('12. POS Regression: Atomic checkout, inventory deduction & overselling protections', async () => {
      // 1. Create a product with initialStock = 12
      const prodRes = await fetch(`${serverUrl}/api/v1/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testOwnerToken}`,
          'x-organization-id': createdBusinessId,
        },
        body: JSON.stringify({
          name: 'DukaFlow Premium Tea 100g',
          sku: `TEA-${timestamp}`,
          costPrice: 45,
          sellingPrice: 75,
          initialStock: 12,
        }),
      });

      if (prodRes.status !== 201) {
        const errText = await prodRes.text();
        throw new Error(`Failed to create product for POS test: ${errText}`);
      }
      const prod = await prodRes.json();
      const productId = prod.id;

      // 2. Perform POS Checkout of 5 units
      const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testOwnerToken}`,
          'x-organization-id': createdBusinessId,
        },
        body: JSON.stringify({
          items: [{ productId, quantity: 5, unitPrice: 75 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 375,
        }),
      });

      if (checkoutRes.status !== 201) {
        const text = await checkoutRes.text();
        throw new Error(`Expected 201 on POS checkout, got ${checkoutRes.status}: ${text}`);
      }

      const checkoutData = await checkoutRes.json();
      if (!checkoutData.id || Number(checkoutData.totalAmount) !== 375) {
        throw new Error(`Sale total amount mismatch: expected 375, got ${checkoutData.totalAmount}`);
      }

      // 3. Verify database inventory level reduced to 7 (12 - 5)
      const inv = await prisma.inventory.findFirst({
        where: { productId },
      });
      if (Number(inv?.quantityOnHand) !== 7) {
        throw new Error(`Expected inventory to be 7, found ${inv?.quantityOnHand}`);
      }

      // 4. Test Overselling Protection: Attempt to checkout 10 units when only 7 remain
      const oversellRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testOwnerToken}`,
          'x-organization-id': createdBusinessId,
        },
        body: JSON.stringify({
          items: [{ productId, quantity: 10, unitPrice: 75 }],
          paymentMethod: PaymentMethod.CASH,
          amountPaid: 750,
        }),
      });

      if (oversellRes.status !== 400) {
        throw new Error(`Expected 400 Insufficient Stock, got ${oversellRes.status}`);
      }

      const oversellBody = await oversellRes.json();
      if (!oversellBody.message?.toLowerCase().includes('insufficient stock')) {
        throw new Error(`Expected 'Insufficient stock' error message, got ${JSON.stringify(oversellBody)}`);
      }

      // Verify stock remains untouched at 7
      const invAfter = await prisma.inventory.findFirst({
        where: { productId },
      });
      if (Number(invAfter?.quantityOnHand) !== 7) {
        throw new Error(`Atomic rollback failed: inventory changed to ${invAfter?.quantityOnHand}`);
      }
    });

  } finally {
    await app.close();
  }

  console.log('\n========================================================================');
  console.log('                          TEST RESULTS SUMMARY');
  console.log('========================================================================');
  let passedCount = 0;
  for (const r of results) {
    const symbol = r.status === 'PASSED' ? '✅' : '❌';
    console.log(`${symbol} [${r.status}] ${r.name}`);
    if (r.error) {
      console.log(`    Error: ${r.error}`);
    }
    if (r.status === 'PASSED') passedCount++;
  }
  console.log('------------------------------------------------------------------------');
  console.log(`Total: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
  console.log('========================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Test execution fatal error:', e);
  process.exit(1);
});
