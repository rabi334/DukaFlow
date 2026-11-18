import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { SalesService } from '../src/modules/sales/sales.service';
import { ProductsService } from '../src/modules/products/products.service';
import { PaymentMethod } from '@prisma/client';

jest.mock('../src/config/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
      signUpEmail: jest.fn(),
      signInEmail: jest.fn(),
      signOut: jest.fn(),
    },
    handler: jest.fn(),
  },
}));

describe('GatiiFlow Core API E2E & Business Rules', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let salesService: SalesService;
  let productsService: ProductsService;
  let testOrgId: string;
  let cashierUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    salesService = app.get<SalesService>(SalesService);
    productsService = app.get<ProductsService>(ProductsService);

    // Fetch seeded org and cashier
    const org = await prisma.organization.findFirst({
      where: { slug: 'addis-mart' },
    });
    testOrgId = org!.id;

    const cashier = await prisma.user.findFirst({
      where: {
        OR: [
          { email: 'cashier@gatiiflow.com' },
          { email: 'cashier@dukaflow.et' },
        ],
      },
    });
    cashierUserId = cashier!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Should retrieve seeded products with current inventory', async () => {
    const products = await productsService.getProducts(testOrgId);
    expect(products.length).toBeGreaterThan(0);

    const ambo = products.find((p) => p.sku === 'AMBO-500');
    expect(ambo).toBeDefined();
    expect(Number(ambo!.sellingPrice)).toBe(40.00);
    expect(Number(ambo!.inventory!.quantityOnHand)).toBeGreaterThan(0);
  });

  it('2. Should correctly filter low-stock items', async () => {
    const lowStockItems = await productsService.getProducts(testOrgId, { lowStock: true });
    // Largo Detergent was seeded with 6 on hand against a threshold of 12
    const largo = lowStockItems.find((p) => p.sku === 'DET-LARGO-1L');
    expect(largo).toBeDefined();
  });

  it('3. POS Atomic Checkout: reduces stock, logs movement, snapshots cost, generates receipt', async () => {
    // Look up Ambo water
    const ambo = await productsService.findByBarcodeOrSku(testOrgId, 'AMBO-500');
    const initialStock = Number(ambo.inventory!.quantityOnHand);
    const saleQty = 3;

    // Checkout 3 bottles
    const saleResult = await salesService.checkout(testOrgId, cashierUserId, {
      items: [{ productId: ambo.id, quantity: saleQty }],
      paymentMethod: PaymentMethod.CASH,
      amountPaid: 120.00,
    });

    expect(saleResult.receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);
    expect(Number(saleResult.totalAmount)).toBe(120.00);
    expect(saleResult.items.length).toBe(1);
    expect(Number(saleResult.items[0].costPriceSnapshot)).toBe(28.00); // Snapshot preserved

    // Verify inventory balance decremented
    const updatedAmbo = await productsService.findByBarcodeOrSku(testOrgId, 'AMBO-500');
    expect(Number(updatedAmbo.inventory!.quantityOnHand)).toBe(initialStock - saleQty);

    // Verify append-only inventory movement ledger
    const movement = await prisma.inventoryMovement.findFirst({
      where: {
        organizationId: testOrgId,
        productId: ambo.id,
        referenceId: saleResult.id,
      },
    });
    expect(movement).toBeDefined();
    expect(Number(movement!.quantity)).toBe(-saleQty);
    expect(movement!.type).toBe('SALE');
  });

  it('4. Concurrency & Overselling Protection: rejects sale when stock is insufficient', async () => {
    const largo = await productsService.findByBarcodeOrSku(testOrgId, 'DET-LARGO-1L');
    const currentStock = Number(largo.inventory!.quantityOnHand);

    // Attempt to sell more than available
    await expect(
      salesService.checkout(testOrgId, cashierUserId, {
        items: [{ productId: largo.id, quantity: currentStock + 100 }],
        paymentMethod: PaymentMethod.CASH,
        amountPaid: 99999,
      }),
    ).rejects.toThrow(/Insufficient stock/);

    // Verify stock was NOT deducted after rejection
    const checkStock = await productsService.findByBarcodeOrSku(testOrgId, 'DET-LARGO-1L');
    expect(Number(checkStock.inventory!.quantityOnHand)).toBe(currentStock);
  });
});
