ALTER TABLE xorpay_payments
  ADD COLUMN IF NOT EXISTS refund_id text,
  ADD COLUMN IF NOT EXISTS refund_arn text,
  ADD COLUMN IF NOT EXISTS refund_status text;

CREATE UNIQUE INDEX IF NOT EXISTS xorpay_payments_refund_id_unique
  ON xorpay_payments (refund_id)
  WHERE refund_id IS NOT NULL;
