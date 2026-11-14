const { PrismaClient } = require('./node_modules/@prisma/client');
require('dotenv').config();

async function runHistoricalMigration() {
  const prisma = new PrismaClient();
  console.log('--- Starting Historical SaleReturn Migration ---');

  const beforeZeroCredit = await prisma.saleReturn.count({
    where: { returnCredit: 0, refundAmount: { gt: 0 } },
  });
  const beforeNullCompletedAt = await prisma.saleReturn.count({
    where: { completedAt: null, status: 'COMPLETED' },
  });
  console.log(`Before migration:`);
  console.log(`  Records with returnCredit = 0: ${beforeZeroCredit}`);
  console.log(`  Completed records with completedAt = null: ${beforeNullCompletedAt}`);

  // Step 1: Backfill return_credit from items or refund_amount
  await prisma.$executeRawUnsafe(`
    UPDATE sale_returns sr
    SET return_credit = COALESCE(
      (SELECT SUM(sri.refund_amount) FROM sale_return_items sri WHERE sri.return_id = sr.id),
      sr.refund_amount
    )
    WHERE sr.return_credit = 0 AND sr.refund_amount > 0;
  `);

  // Step 2: Backfill completed_at for historical completed returns
  await prisma.$executeRawUnsafe(`
    UPDATE sale_returns
    SET completed_at = created_at
    WHERE completed_at IS NULL AND status = 'COMPLETED';
  `);

  // Step 3: Backfill refund_disbursed, unpaid_cancelled, customer_credit_disbursed
  await prisma.$executeRawUnsafe(`
    WITH sale_payment_totals AS (
      SELECT s.id AS sale_id, COALESCE(SUM(p.amount), 0) AS total_paid
      FROM sales s
      LEFT JOIN payments p ON p.sale_id = s.id
      GROUP BY s.id
    )
    UPDATE sale_returns sr
    SET 
      refund_disbursed = LEAST(sr.return_credit, GREATEST(0, spt.total_paid)),
      unpaid_cancelled = sr.return_credit - LEAST(sr.return_credit, GREATEST(0, spt.total_paid)),
      customer_credit_disbursed = 0
    FROM sale_payment_totals spt
    WHERE sr.sale_id = spt.sale_id
      AND sr.refund_disbursed = 0 
      AND sr.unpaid_cancelled = 0 
      AND sr.return_credit > 0;
  `);

  const afterZeroCredit = await prisma.saleReturn.count({
    where: { returnCredit: 0, refundAmount: { gt: 0 } },
  });
  const afterNullCompletedAt = await prisma.saleReturn.count({
    where: { completedAt: null, status: 'COMPLETED' },
  });
  console.log(`After migration:`);
  console.log(`  Records with returnCredit = 0: ${afterZeroCredit}`);
  console.log(`  Completed records with completedAt = null: ${afterNullCompletedAt}`);

  // Sample check
  const samples = await prisma.saleReturn.findMany({
    take: 5,
    orderBy: { createdAt: 'asc' },
    select: {
      returnNumber: true,
      returnCredit: true,
      refundDisbursed: true,
      unpaidCancelled: true,
      refundAmount: true,
      status: true,
      completedAt: true,
    },
  });
  console.log('\nSample migrated historical records:');
  for (const s of samples) {
    console.log(`  ${s.returnNumber}: credit=${s.returnCredit}, disbursed=${s.refundDisbursed}, cancelled=${s.unpaidCancelled}, completedAt=${s.completedAt?.toISOString()}`);
  }

  await prisma.$disconnect();
  console.log('--- Migration Completed Successfully ---');
}

runHistoricalMigration().catch(console.error);
