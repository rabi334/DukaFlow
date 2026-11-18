import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { SalesService } from '../src/modules/sales/sales.service';
import { ProductsService } from '../src/modules/products/products.service';
import { PaymentMethod } from '@prisma/client';

async function runTests() {
  console.log('🧪 Starting GatiiFlow Automated System Verification...');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const salesService = app.get(SalesService);
  const productsService = app.get(ProductsService);

  try {
    const org = await prisma.organization.findFirst({ where: { slug: 'addis-mart' } });
    if (!org) throw new Error('Seeded organization not found');
    const orgId = org.id;

    const cashier = await prisma.user.findFirst({
      where: {
        OR: [
          { email: 'cashier@gatiiflow.com' },
          { email: 'cashier@dukaflow.et' },
        ],
      },
    });
    if (!cashier) throw new Error('Seeded cashier not found');
    const cashierId = cashier.id;

    // Test 1: Products list and stock inspection
    console.log('Test 1: Verify products catalog & inventory levels...');
    const products = await productsService.getProducts(orgId);
    if (products.length === 0) throw new Error('No products found');
    const ambo = products.find((p) => p.sku === 'AMBO-500');
    if (!ambo || Number(ambo.sellingPrice) !== 40.00) throw new Error('Ambo water details mismatch');
    console.log(`  ✓ Found ${products.length} catalog items. Ambo price: ETB ${ambo.sellingPrice}`);

    // Test 2: Low-stock detection
    console.log('Test 2: Verify low-stock filtering logic...');
    const lowStock = await productsService.getProducts(orgId, { lowStock: true });
    const largo = lowStock.find((p) => p.sku === 'DET-LARGO-1L');
    if (!largo) throw new Error('Expected Largo detergent in low-stock list');
    console.log(`  ✓ Low stock correctly detected: ${largo.name} (Qty: ${largo.inventory?.quantityOnHand})`);

    // Test 3: Atomic POS Checkout
    console.log('Test 3: Verify POS Atomic Checkout...');
    const initialAmboStock = Number(ambo.inventory?.quantityOnHand || 0);
    const saleQty = 2;

    const sale = await salesService.checkout(orgId, cashierId, {
      items: [{ productId: ambo.id, quantity: saleQty }],
      paymentMethod: PaymentMethod.CASH,
      amountPaid: 80.00,
    });

    if (!sale.receiptNumber.startsWith('REC-')) throw new Error('Invalid receipt number');
    if (Number(sale.totalAmount) !== 80.00) throw new Error('Sale total amount mismatch');
    if (Number(sale.items[0].costPriceSnapshot) !== 28.00) throw new Error('Cost snapshot missing or incorrect');

    // Verify stock balance was decremented
    const updatedAmbo = await productsService.findByBarcodeOrSku(orgId, 'AMBO-500');
    const newStock = Number(updatedAmbo.inventory?.quantityOnHand || 0);
    if (newStock !== initialAmboStock - saleQty) {
      throw new Error(`Inventory balance mismatch: Expected ${initialAmboStock - saleQty}, got ${newStock}`);
    }

    // Verify append-only inventory movement ledger
    const movement = await prisma.inventoryMovement.findFirst({
      where: { organizationId: orgId, productId: ambo.id, referenceId: sale.id },
    });
    if (!movement || Number(movement.quantity) !== -saleQty || movement.type !== 'SALE') {
      throw new Error('Inventory movement ledger record invalid or missing');
    }
    console.log(`  ✓ Sale ${sale.receiptNumber} committed atomically. Stock decremented: ${initialAmboStock} -> ${newStock}`);
    console.log(`  ✓ Ledger entry recorded: ${movement.reason}`);

    // Test 4: Overselling protection
    console.log('Test 4: Verify concurrency & overselling protection...');
    let threwExpectedError = false;
    try {
      await salesService.checkout(orgId, cashierId, {
        items: [{ productId: largo.id, quantity: 9999 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 999999,
      });
    } catch (err: any) {
      if (err.message.includes('Insufficient stock')) {
        threwExpectedError = true;
      }
    }
    if (!threwExpectedError) throw new Error('System allowed overselling when stock was insufficient');
    console.log('  ✓ Overselling successfully blocked by business rule.');

    console.log('\n🎉 ALL 4 CORE VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runTests();
