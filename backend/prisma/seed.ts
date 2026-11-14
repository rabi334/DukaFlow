import { PrismaClient, StockMovementType, PaymentMethod, SaleStatus, MemberStatus } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding DukaFlow database ---');

  // Compute Better Auth cryptographic password hash for password123
  const hashedPassword = await hashPassword('password123');

  // 1. Create Demo Owner User
  const ownerUser = await prisma.user.upsert({
    where: { email: 'owner@dukaflow.et' },
    update: {
      name: 'Abebe Bikila',
    },
    create: {
      name: 'Abebe Bikila',
      email: 'owner@dukaflow.et',
      emailVerified: true,
      image: null,
    },
  });

  // Create an account with Better Auth hashed password for Owner
  await prisma.account.upsert({
    where: { id: 'seed-owner-account' },
    update: {
      password: hashedPassword,
      userId: ownerUser.id,
      providerId: 'credential',
      accountId: ownerUser.id,
    },
    create: {
      id: 'seed-owner-account',
      userId: ownerUser.id,
      providerId: 'credential',
      accountId: ownerUser.id,
      password: hashedPassword,
    },
  });

  // 2. Create Demo Cashier User
  const cashierUser = await prisma.user.upsert({
    where: { email: 'cashier@dukaflow.et' },
    update: {
      name: 'Tigist Assefa',
    },
    create: {
      name: 'Tigist Assefa',
      email: 'cashier@dukaflow.et',
      emailVerified: true,
      image: null,
    },
  });

  // Create an account with Better Auth hashed password for Cashier
  await prisma.account.upsert({
    where: { id: 'seed-cashier-account' },
    update: {
      password: hashedPassword,
      userId: cashierUser.id,
      providerId: 'credential',
      accountId: cashierUser.id,
    },
    create: {
      id: 'seed-cashier-account',
      userId: cashierUser.id,
      providerId: 'credential',
      accountId: cashierUser.id,
      password: hashedPassword,
    },
  });

  // 3. Create Demo Business Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'addis-mart' },
    update: {},
    create: {
      name: 'Addis Supermarket & Mini-Mart',
      slug: 'addis-mart',
      currency: 'ETB',
      businessType: 'Grocery & Retail',
      city: 'Addis Ababa',
      address: 'Bole Road, Mega Building Ground Floor',
      phoneNumber: '+251 91 123 4567',
      tinNumber: '0012345678',
      taxRate: 0.15,
      taxInclusive: true,
      receiptHeader: 'ADDIS SUPERMARKET\nThank you for shopping with us!',
      receiptFooter: 'Goods once sold cannot be returned without receipt\nCall: +251 91 123 4567',
      allowNegative: false,
    },
  });

  // 4. Assign Memberships
  await prisma.member.upsert({
    where: {
      userId_organizationId: {
        userId: ownerUser.id,
        organizationId: org.id,
      },
    },
    update: {
      status: MemberStatus.ACTIVE,
      role: 'owner',
    },
    create: {
      userId: ownerUser.id,
      organizationId: org.id,
      role: 'owner',
      status: MemberStatus.ACTIVE,
    },
  });

  await prisma.member.upsert({
    where: {
      userId_organizationId: {
        userId: cashierUser.id,
        organizationId: org.id,
      },
    },
    update: {
      status: MemberStatus.ACTIVE,
      role: 'cashier',
    },
    create: {
      userId: cashierUser.id,
      organizationId: org.id,
      role: 'cashier',
      status: MemberStatus.ACTIVE,
    },
  });

  // 5. Create Categories
  const categoriesData = [
    { name: 'Beverages & Drinks', description: 'Soft drinks, bottled water, juices' },
    { name: 'Dairy & Eggs', description: 'Milk, cheese, yogurt, fresh eggs' },
    { name: 'Bakery & Grains', description: 'Bread, flour, teff, pasta, rice' },
    { name: 'Personal Care', description: 'Soaps, toothpaste, shampoo' },
    { name: 'Household Essentials', description: 'Detergents, cleaning products, tissues' },
  ];

  const createdCategories: Record<string, string> = {};
  for (const cat of categoriesData) {
    const record = await prisma.category.upsert({
      where: {
        organizationId_name: {
          organizationId: org.id,
          name: cat.name,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        name: cat.name,
        description: cat.description,
      },
    });
    createdCategories[cat.name] = record.id;
  }

  // 6. Create Initial Products with Inventory and Opening Stock Movements
  const productsData = [
    {
      name: 'Ambo Mineral Water 500ml',
      sku: 'AMBO-500',
      barcode: '600100100101',
      category: 'Beverages & Drinks',
      unit: 'bottle',
      costPrice: 28.00,
      sellingPrice: 40.00,
      minStockThreshold: 20,
      openingStock: 120,
    },
    {
      name: 'Harar Coffee Beans 500g',
      sku: 'COF-HARAR-500',
      barcode: '600100100102',
      category: 'Beverages & Drinks',
      unit: 'pack',
      costPrice: 380.00,
      sellingPrice: 520.00,
      minStockThreshold: 10,
      openingStock: 45,
    },
    {
      name: 'Mama Whole Milk 500ml',
      sku: 'MILK-MAMA-500',
      barcode: '600100100103',
      category: 'Dairy & Eggs',
      unit: 'pouch',
      costPrice: 45.00,
      sellingPrice: 60.00,
      minStockThreshold: 15,
      openingStock: 80,
    },
    {
      name: 'White Teff (Magna) 25kg',
      sku: 'TEFF-MAGNA-25KG',
      barcode: '600100100104',
      category: 'Bakery & Grains',
      unit: 'bag',
      costPrice: 2800.00,
      sellingPrice: 3400.00,
      minStockThreshold: 5,
      openingStock: 18,
    },
    {
      name: 'Bia Soap 100g',
      sku: 'SOAP-BIA-100',
      barcode: '600100100105',
      category: 'Personal Care',
      unit: 'pcs',
      costPrice: 32.00,
      sellingPrice: 50.00,
      minStockThreshold: 25,
      openingStock: 150,
    },
    {
      name: 'Largo Multi-Purpose Detergent 1L',
      sku: 'DET-LARGO-1L',
      barcode: '600100100106',
      category: 'Household Essentials',
      unit: 'bottle',
      costPrice: 110.00,
      sellingPrice: 160.00,
      minStockThreshold: 12,
      openingStock: 6, // Low stock trigger!
    },
  ];

  for (const item of productsData) {
    const product = await prisma.product.upsert({
      where: {
        organizationId_sku: {
          organizationId: org.id,
          sku: item.sku,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        categoryId: createdCategories[item.category],
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        unit: item.unit,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        minStockThreshold: item.minStockThreshold,
      },
    });

    // Create or update inventory
    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: { quantityOnHand: item.openingStock },
      create: {
        productId: product.id,
        quantityOnHand: item.openingStock,
      },
    });

    // Record opening stock movement
    await prisma.inventoryMovement.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        actorUserId: ownerUser.id,
        type: StockMovementType.OPENING_STOCK,
        quantity: item.openingStock,
        reason: 'Initial system setup opening stock',
      },
    });
  }

  // 7. Create Demo Supplier
  const supplier = await prisma.supplier.upsert({
    where: {
      organizationId_name: {
        organizationId: org.id,
        name: 'Ethiopian Beverages & Food Distribution PLC',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Ethiopian Beverages & Food Distribution PLC',
      contactName: 'Kebede Michael',
      phoneNumber: '+251 91 222 3344',
      email: 'sales@ethiobeverages.et',
      address: 'Kality Industrial Zone, Addis Ababa',
      tinNumber: '0098765432',
      notes: 'Delivers every Tuesday and Friday',
    },
  });

  // 8. Create Demo Operating Expenses
  await prisma.expense.createMany({
    data: [
      {
        organizationId: org.id,
        category: 'Rent',
        amount: 35000.00,
        description: 'Monthly shop space rent - Mega Building',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        date: new Date(),
      },
      {
        organizationId: org.id,
        category: 'Electricity',
        amount: 2450.00,
        description: 'EEU commercial electricity bill',
        paymentMethod: PaymentMethod.TELEBIRR,
        date: new Date(),
      },
    ],
  });

  console.log('✅ Seed completed successfully:');
  console.log(`- Organization: ${org.name} (ID: ${org.id})`);
  console.log(`- Owner: ${ownerUser.email} (Role: owner)`);
  console.log(`- Cashier: ${cashierUser.email} (Role: cashier)`);
  console.log(`- Products: ${productsData.length} items with inventory & stock movements`);
  console.log(`- Supplier: ${supplier.name}`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
