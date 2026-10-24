ALTER TABLE xorpay_beneficiaries
  ADD COLUMN IF NOT EXISTS nickname text;

ALTER TABLE xorpay_beneficiaries
  ALTER COLUMN registered_name DROP NOT NULL;
