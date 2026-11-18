import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { MemberStatus, PaymentMethod, PurchaseStatus, SaleStatus, StockMovementType } from '@prisma/client';

async function runPhase3Tests() {
  console.log('========================================================================');
  console.log('  GATIIFLOW PHASE 3: CORE BUSINESS WORKFLOWS VERIFICATION SUITE');
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

  const ts = Date.now();
  const password = 'Phase3SecurePass2026!';

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

  // Helper HTTP functions
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

  // 1. Setup Business & Users
  console.log('--- Setting up test workspace & multi-role staff ---');
  const ownerReg = await registerUser('Phase3 Owner', `p3-owner-${ts}@gatiiflow.com`);
  const cashierReg = await registerUser('Phase3 Cashier', `p3-cashier-${ts}@gatiiflow.com`);
  const managerReg = await registerUser('Phase3 Manager', `p3-mgr-${ts}@gatiiflow.com`);
  const invStaffReg = await registerUser('Phase3 Inventory', `p3-inv-${ts}@gatiiflow.com`);

  const ownerLogin = await loginUser(`p3-owner-${ts}@gatiiflow.com`);
  const cashierLogin = await loginUser(`p3-cashier-${ts}@gatiiflow.com`);
  const managerLogin = await loginUser(`p3-mgr-${ts}@gatiiflow.com`);
  const invStaffLogin = await loginUser(`p3-inv-${ts}@gatiiflow.com`);

  const ownerToken = ownerLogin.session.token;
  const cashierToken = cashierLogin.session.token;
  const managerToken = managerLogin.session.token;
  const invStaffToken = invStaffLogin.session.token;

  // Onboard Business
  const onboardRes = await fetch(`${serverUrl}/api/v1/business/onboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      name: `Phase 3 Supermarket ${ts}`,
      city: 'Addis Ababa',
      businessType: 'Retail',
      currency: 'ETB',
    }),
  });
  const onboardData = await onboardRes.json();
  const orgId = onboardData.business.id;

  // Setup Memberships
  await prisma.member.createMany({
    data: [
      { organizationId: orgId, userId: cashierReg.user.id, role: 'cashier', status: MemberStatus.ACTIVE },
      { organizationId: orgId, userId: managerReg.user.id, role: 'manager', status: MemberStatus.ACTIVE },
      { organizationId: orgId, userId: invStaffReg.user.id, role: 'inventory_staff', status: MemberStatus.ACTIVE },
    ],
  });

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

  const managerHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${managerToken}`,
    'x-organization-id': orgId,
  };

  const invStaffHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${invStaffToken}`,
    'x-organization-id': orgId,
  };

  let testProductId: string;
  let testSupplierId: string;
  let testPurchaseId: string;
  let testPurchaseItemId: string;
  let testSaleId: string;
  let testSaleItemId: string;

  console.log(`Setup complete. Org ID: ${orgId}\n`);

  // =========================================================================
  // SECTION 1: PRODUCT MANAGEMENT LIFECYCLE
  // =========================================================================

  await test('1. Create product with initial stock & opening stock ledger entry', async () => {
    const res = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'GatiiFlow Premium Teff 25kg',
        sku: `TEFF-25KG-${ts}`,
        barcode: `BAR-TEFF-${ts}`,
        unit: 'bag',
        costPrice: 2800,
        sellingPrice: 3400,
        minStockThreshold: 10,
        initialStock: 50,
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    testProductId = data.id;

    // Verify inventory balance
    const inv = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    if (Number(inv?.quantityOnHand) !== 50) {
      throw new Error(`Expected 50 on hand, got ${inv?.quantityOnHand}`);
    }

    // Verify opening stock movement
    const movement = await prisma.inventoryMovement.findFirst({
      where: { productId: testProductId, type: StockMovementType.OPENING_STOCK },
    });
    if (!movement || Number(movement.quantity) !== 50) {
      throw new Error('Opening stock movement was not created');
    }
  });

  await test('2. Duplicate SKU rejected within same organization (HTTP 400)', async () => {
    const res = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'Duplicate SKU Product',
        sku: `TEFF-25KG-${ts}`, // duplicate
        costPrice: 100,
        sellingPrice: 150,
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = await res.json();
    if (!body.message?.includes('already exists')) {
      throw new Error(`Expected duplicate message, got ${body.message}`);
    }
  });

  await test('3. Duplicate barcode rejected within same organization (HTTP 400)', async () => {
    const res = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'Different SKU Same Barcode',
        sku: `DIFF-SKU-${ts}`,
        barcode: `BAR-TEFF-${ts}`, // duplicate barcode
        costPrice: 100,
        sellingPrice: 150,
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = await res.json();
    if (!body.message?.includes('barcode')) {
      throw new Error(`Expected barcode conflict message, got ${body.message}`);
    }
  });

  await test('4. Update product details & enforce uniqueness on SKU/barcode edits', async () => {
    const updateRes = await fetch(`${serverUrl}/api/v1/products/${testProductId}`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'GatiiFlow Premium White Teff 25kg (Magna)',
        sellingPrice: 3500,
        minStockThreshold: 12,
      }),
    });

    if (updateRes.status !== 200) throw new Error(`Expected 200, got ${updateRes.status}`);
    const updated = await updateRes.json();
    if (Number(updated.sellingPrice) !== 3500) throw new Error('Selling price not updated');
    if (updated.name !== 'GatiiFlow Premium White Teff 25kg (Magna)') throw new Error('Name not updated');
  });

  await test('5. Product archive and restore lifecycle', async () => {
    // Archive
    const archRes = await fetch(`${serverUrl}/api/v1/products/${testProductId}`, {
      method: 'DELETE',
      headers: ownerHeaders,
    });
    if (archRes.status !== 200) throw new Error(`Archive failed with ${archRes.status}`);

    const archivedProd = await prisma.product.findUnique({ where: { id: testProductId } });
    if (!archivedProd?.isArchived) throw new Error('Product isArchived is not true');

    // Should not appear in standard active products query
    const listRes = await fetch(`${serverUrl}/api/v1/products`, {
      method: 'GET',
      headers: ownerHeaders,
    });
    const activeList = await listRes.json();
    if (activeList.some((p: any) => p.id === testProductId)) {
      throw new Error('Archived product appeared in active products list');
    }

    // Restore
    const restoreRes = await fetch(`${serverUrl}/api/v1/products/${testProductId}/restore`, {
      method: 'PATCH',
      headers: ownerHeaders,
    });
    if (restoreRes.status !== 200) throw new Error(`Restore failed with ${restoreRes.status}`);

    const restoredProd = await prisma.product.findUnique({ where: { id: testProductId } });
    if (restoredProd?.isArchived) throw new Error('Product isArchived still true after restore');
  });

  await test('6. Safeguard: Prevent permanent deletion of products with history', async () => {
    const delRes = await fetch(`${serverUrl}/api/v1/products/${testProductId}/permanent`, {
      method: 'DELETE',
      headers: ownerHeaders,
    });
    if (delRes.status !== 400) throw new Error(`Expected 400, got ${delRes.status}`);
    const body = await delRes.json();
    if (!body.message?.includes('historical')) {
      throw new Error(`Expected historical protection message, got ${body.message}`);
    }
  });

  // =========================================================================
  // SECTION 2: SUPPLIER MANAGEMENT
  // =========================================================================

  await test('7. Create supplier and reject duplicate supplier name', async () => {
    const res = await fetch(`${serverUrl}/api/v1/purchases/suppliers`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Ethiopian Grain Trade Enterprise ${ts}`,
        contactName: 'Ato Solomon',
        phoneNumber: '+251 911 556677',
        email: `egte-${ts}@grain.et`,
        tinNumber: '0033445566',
        address: 'Addis Ababa, Gotera',
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    testSupplierId = data.id;

    // Duplicate check
    const dupRes = await fetch(`${serverUrl}/api/v1/purchases/suppliers`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: `Ethiopian Grain Trade Enterprise ${ts}`,
      }),
    });
    if (dupRes.status !== 400) throw new Error(`Expected 400 for duplicate supplier, got ${dupRes.status}`);
  });

  await test('8. Update and archive supplier', async () => {
    const updateRes = await fetch(`${serverUrl}/api/v1/purchases/suppliers/${testSupplierId}`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({
        contactName: 'W/ro Meron',
        notes: 'Priority agricultural supplier',
      }),
    });
    if (updateRes.status !== 200) throw new Error(`Update failed with ${updateRes.status}`);
    const updated = await updateRes.json();
    if (updated.contactName !== 'W/ro Meron') throw new Error('Contact name not updated');
  });

  // =========================================================================
  // SECTION 3: PURCHASE MANAGEMENT AND RECEIVING
  // =========================================================================

  await test('9. Create Purchase Order (Verify stock DOES NOT increase on creation)', async () => {
    const stockBefore = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const onHandBefore = Number(stockBefore?.quantityOnHand || 0);

    const poRes = await fetch(`${serverUrl}/api/v1/purchases`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        supplierId: testSupplierId,
        notes: 'Monthly bulk harvest order',
        items: [
          {
            productId: testProductId,
            orderedQty: 100,
            unitCost: 2800,
          },
        ],
      }),
    });

    if (poRes.status !== 201) throw new Error(`Expected 201, got ${poRes.status}`);
    const poData = await poRes.json();
    testPurchaseId = poData.id;
    testPurchaseItemId = poData.items[0].id;

    if (poData.status !== PurchaseStatus.ORDERED) {
      throw new Error(`Expected status ORDERED, got ${poData.status}`);
    }

    // Verify stock did NOT change
    const stockAfter = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const onHandAfter = Number(stockAfter?.quantityOnHand || 0);
    if (onHandAfter !== onHandBefore) {
      throw new Error(`Stock changed on PO creation! Before: ${onHandBefore}, After: ${onHandAfter}`);
    }
  });

  await test('10. Partial stock receiving: Stock increments strictly by received qty, status -> PARTIALLY_RECEIVED', async () => {
    const stockBefore = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const onHandBefore = Number(stockBefore?.quantityOnHand || 0);

    const receiveRes = await fetch(`${serverUrl}/api/v1/purchases/${testPurchaseId}/receive`, {
      method: 'POST',
      headers: invStaffHeaders,
      body: JSON.stringify({
        receivedItems: [
          {
            purchaseItemId: testPurchaseItemId,
            receivedQty: 40, // Partial 40 of 100
          },
        ],
      }),
    });

    if (receiveRes.status !== 201 && receiveRes.status !== 200) {
      throw new Error(`Receive failed with status ${receiveRes.status}`);
    }
    const updatedPo = await receiveRes.json();

    if (updatedPo.status !== PurchaseStatus.PARTIALLY_RECEIVED) {
      throw new Error(`Expected PARTIALLY_RECEIVED, got ${updatedPo.status}`);
    }

    // Stock should increase by exactly 40
    const stockAfter = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const onHandAfter = Number(stockAfter?.quantityOnHand || 0);
    if (onHandAfter !== onHandBefore + 40) {
      throw new Error(`Expected onHand to increase by 40, was ${onHandBefore} -> ${onHandAfter}`);
    }

    // Movement ledger entry
    const movement = await prisma.inventoryMovement.findFirst({
      where: {
        productId: testProductId,
        type: StockMovementType.PURCHASE_RECEIPT,
        referenceId: testPurchaseId,
      },
    });
    if (!movement || Number(movement.quantity) !== 40) {
      throw new Error('Purchase receipt stock movement was not logged correctly');
    }
  });

  await test('11. Over-receiving guard: reject receiving more than remaining ordered quantity', async () => {
    // Ordered was 100, 40 already received -> remaining is 60. Attempt to receive 70.
    const res = await fetch(`${serverUrl}/api/v1/purchases/${testPurchaseId}/receive`, {
      method: 'POST',
      headers: invStaffHeaders,
      body: JSON.stringify({
        receivedItems: [
          {
            purchaseItemId: testPurchaseItemId,
            receivedQty: 70,
          },
        ],
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = await res.json();
    if (!body.message?.includes('remaining')) {
      throw new Error(`Expected remaining quantity rejection message, got: ${body.message}`);
    }
  });

  await test('12. Final receiving: receive remaining items -> status transitions to RECEIVED', async () => {
    const res = await fetch(`${serverUrl}/api/v1/purchases/${testPurchaseId}/receive`, {
      method: 'POST',
      headers: invStaffHeaders,
      body: JSON.stringify({
        receivedItems: [
          {
            purchaseItemId: testPurchaseItemId,
            receivedQty: 60, // remaining 60 of 100
          },
        ],
      }),
    });

    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`Receive failed with status ${res.status}`);
    }
    const completedPo = await res.json();

    if (completedPo.status !== PurchaseStatus.RECEIVED) {
      throw new Error(`Expected status RECEIVED, got ${completedPo.status}`);
    }
  });

  await test('13. Reject receiving against already completed purchase order', async () => {
    const res = await fetch(`${serverUrl}/api/v1/purchases/${testPurchaseId}/receive`, {
      method: 'POST',
      headers: invStaffHeaders,
      body: JSON.stringify({
        receivedItems: [
          {
            purchaseItemId: testPurchaseItemId,
            receivedQty: 5,
          },
        ],
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = await res.json();
    if (!body.message?.includes('already been fully received')) {
      throw new Error(`Expected completed error message, got: ${body.message}`);
    }
  });

  // =========================================================================
  // SECTION 4: SALES HISTORY & RETURNS
  // =========================================================================

  await test('14. POS Checkout: creates receipt, calculates VAT, and decrements stock', async () => {
    const stockBefore = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const onHandBefore = Number(stockBefore?.quantityOnHand || 0);

    const checkoutRes = await fetch(`${serverUrl}/api/v1/sales/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [
          {
            productId: testProductId,
            quantity: 5,
            unitPrice: 3500,
          },
        ],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 17500,
        notes: 'Walk-in customer purchase',
      }),
    });

    if (checkoutRes.status !== 201) throw new Error(`Checkout failed with ${checkoutRes.status}`);
    const sale = await checkoutRes.json();
    testSaleId = sale.id;

    // Get sale item ID from DB
    const dbSale = await prisma.sale.findUnique({
      where: { id: testSaleId },
      include: { items: true },
    });
    testSaleItemId = dbSale!.items[0].id;

    // Stock decremented by 5
    const stockAfter = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const onHandAfter = Number(stockAfter?.quantityOnHand || 0);
    if (onHandAfter !== onHandBefore - 5) {
      throw new Error(`Expected onHand to decrease by 5, was ${onHandBefore} -> ${onHandAfter}`);
    }
  });

  await test('15. Sales History: filter by receipt #, date, and cashier isolation', async () => {
    // Owner queries sales with search
    const dbSale = await prisma.sale.findUnique({ where: { id: testSaleId } });
    const receiptNum = dbSale!.receiptNumber;

    const searchRes = await fetch(`${serverUrl}/api/v1/sales?search=${receiptNum}`, {
      method: 'GET',
      headers: ownerHeaders,
    });
    const foundSales = await searchRes.json();
    if (foundSales.length === 0 || foundSales[0].receiptNumber !== receiptNum) {
      throw new Error('Search by receipt number failed');
    }

    // Cashier query: verify cost prices are masked
    const cashierRes = await fetch(`${serverUrl}/api/v1/sales/${testSaleId}`, {
      method: 'GET',
      headers: cashierHeaders,
    });
    const cashierSale = await cashierRes.json();
    if (cashierSale.items[0].costPriceSnapshot !== undefined) {
      throw new Error('Cost price was exposed to Cashier in sales details');
    }
  });

  await test('16. Return Validation: reject return quantity exceeding purchased quantity', async () => {
    // Purchased 5, attempt to return 10
    const res = await fetch(`${serverUrl}/api/v1/sales/${testSaleId}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: testSaleItemId, quantity: 10 }],
        reason: 'Excessive return attempt',
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = await res.json();
    if (!body.message?.includes('remain returnable')) {
      throw new Error(`Expected return quantity limit message, got: ${body.message}`);
    }
  });

  await test('17. Process Partial Return: restocks inventory atomically & logs SALE_RETURN movement', async () => {
    const stockBefore = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const onHandBefore = Number(stockBefore?.quantityOnHand || 0);

    const res = await fetch(`${serverUrl}/api/v1/sales/${testSaleId}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: testSaleItemId, quantity: 2 }], // return 2 of 5
        reason: 'Customer purchased excess bags',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const returnData = await res.json();

    if (Number(returnData.refundAmount) !== 7000) { // 2 * 3500
      throw new Error(`Expected 7000 refund, got ${returnData.refundAmount}`);
    }

    // Stock should increase by 2
    const stockAfter = await prisma.inventory.findUnique({ where: { productId: testProductId } });
    const onHandAfter = Number(stockAfter?.quantityOnHand || 0);
    if (onHandAfter !== onHandBefore + 2) {
      throw new Error(`Expected stock to increase by 2, got ${onHandBefore} -> ${onHandAfter}`);
    }

    // Movement ledger verification
    const retMovement = await prisma.inventoryMovement.findFirst({
      where: {
        productId: testProductId,
        type: StockMovementType.SALE_RETURN,
        referenceId: returnData.id,
      },
    });
    if (!retMovement || Number(retMovement.quantity) !== 2) {
      throw new Error('SALE_RETURN inventory movement record missing or incorrect');
    }
  });

  await test('18. Complete Return: returning remaining items transitions sale status to REFUNDED', async () => {
    // Remaining is 3 of 5
    const res = await fetch(`${serverUrl}/api/v1/sales/${testSaleId}/return`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ saleItemId: testSaleItemId, quantity: 3 }],
        reason: 'Customer returning remaining quantity',
        refundMethod: PaymentMethod.CASH,
        restockInventory: true,
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);

    // Verify sale status in DB is now REFUNDED
    const updatedSale = await prisma.sale.findUnique({ where: { id: testSaleId } });
    if (updatedSale?.status !== SaleStatus.REFUNDED) {
      throw new Error(`Expected sale status REFUNDED, got ${updatedSale?.status}`);
    }
  });

  // =========================================================================
  // SECTION 5: STAFF MANAGEMENT & INVITATIONS
  // =========================================================================

  let testInviteId: string;
  const inviteeEmail = `invitee-${ts}@gatiiflow.com`;

  await test('19. Invite staff by email & list pending invitations', async () => {
    const inviteRes = await fetch(`${serverUrl}/api/v1/business/members/invite`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        email: inviteeEmail,
        role: 'cashier',
      }),
    });

    if (inviteRes.status !== 201 && inviteRes.status !== 200) {
      throw new Error(`Invite failed with ${inviteRes.status}`);
    }
    const invData = await inviteRes.json();
    testInviteId = invData.id;

    // List invitations
    const listRes = await fetch(`${serverUrl}/api/v1/business/invitations`, {
      method: 'GET',
      headers: ownerHeaders,
    });
    const invList = await listRes.json();
    if (!invList.some((i: any) => i.id === testInviteId)) {
      throw new Error('New invitation not found in pending list');
    }
  });

  await test('20. Accept invitation: registered user accepts invitation & joins workspace', async () => {
    // Register the invited user
    const inviteeReg = await registerUser('Invited Cashier', inviteeEmail);
    const inviteeLogin = await loginUser(inviteeEmail);
    const inviteeToken = inviteeLogin.session.token;

    // Accept invitation
    const acceptRes = await fetch(`${serverUrl}/api/v1/business/invitations/${testInviteId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${inviteeToken}`,
      },
    });

    if (acceptRes.status !== 200 && acceptRes.status !== 201) {
      throw new Error(`Accept invitation failed with ${acceptRes.status}`);
    }

    // Verify member created in DB
    const member = await prisma.member.findUnique({
      where: {
        userId_organizationId: {
          userId: inviteeReg.user.id,
          organizationId: orgId,
        },
      },
    });

    if (!member || member.status !== MemberStatus.ACTIVE || member.role !== 'cashier') {
      throw new Error('Membership was not created correctly upon invitation acceptance');
    }
  });

  await test('21. Staff Role & Status modification with Sole Owner Protection', async () => {
    // 1. Promote cashier to manager
    const roleRes = await fetch(`${serverUrl}/api/v1/business/members/${cashierReg.user.id}/role`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ role: 'manager' }),
    });
    // In our service, memberId is the Member table ID
    const member = await prisma.member.findUnique({
      where: { userId_organizationId: { userId: cashierReg.user.id, organizationId: orgId } },
    });
    const realRoleRes = await fetch(`${serverUrl}/api/v1/business/members/${member!.id}/role`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ role: 'manager' }),
    });
    if (realRoleRes.status !== 200) throw new Error(`Role update failed with ${realRoleRes.status}`);

    // 2. Sole owner protection: Attempt to deactivate the only owner
    const ownerMember = await prisma.member.findUnique({
      where: { userId_organizationId: { userId: ownerReg.user.id, organizationId: orgId } },
    });

    const deactRes = await fetch(`${serverUrl}/api/v1/business/members/${ownerMember!.id}/status`, {
      method: 'PATCH',
      headers: ownerHeaders,
      body: JSON.stringify({ status: MemberStatus.DEACTIVATED }),
    });

    if (deactRes.status !== 400) throw new Error(`Expected 400 when deactivating sole owner, got ${deactRes.status}`);
    const body = await deactRes.json();
    if (!body.message?.includes('sole active owner')) {
      throw new Error(`Expected sole owner protection message, got ${body.message}`);
    }
  });

  // Close app
  await app.close();

  console.log('\n========================================================================');
  console.log('  PHASE 3 VERIFICATION SUMMARY');
  console.log('========================================================================');
  console.log(`Total Workflows Tested: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);

  if (failedTests === 0) {
    console.log('\n🎉 ALL PHASE 3 WORKFLOW TESTS PASSED CLEANLY WITH ZERO FAILURES!\n');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failedTests} PHASE 3 TESTS FAILED.\n`);
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
