-- DukaFlow: Historical SaleReturn Reconciliation Migration
-- Idempotent, safe migration for backfilling historical return credits, disbursements, and completion timestamps.

-- 1. Ensure columns exist on sale_returns
ALTER TABLE "sale_returns" 
ADD COLUMN IF NOT EXISTS "return_credit" DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "refund_disbursed" DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "unpaid_cancelled" DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "customer_credit_disbursed" DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

-- 2. Backfill return_credit from line items or legacy refund_amount for historical records
UPDATE sale_returns sr
SET return_credit = COALESCE(
  (SELECT SUM(sri.refund_amount) FROM sale_return_items sri WHERE sri.return_id = sr.id),
  sr.refund_amount
)
WHERE sr.return_credit = 0 AND sr.refund_amount > 0;

-- 3. Backfill completed_at for historical completed returns
UPDATE sale_returns
SET completed_at = created_at
WHERE completed_at IS NULL AND status = 'COMPLETED';

-- 4. Backfill refund_disbursed, unpaid_cancelled, and customer_credit_disbursed based on verified customer payments
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
