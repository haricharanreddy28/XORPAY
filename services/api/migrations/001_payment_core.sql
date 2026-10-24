CREATE TABLE IF NOT EXISTS xorpay_payments (
  id text PRIMARY KEY,
  user_phone text NOT NULL,
  beneficiary_id text,
  category text NOT NULL CHECK (category IN ('vendor', 'rent')),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  payee_minor bigint NOT NULL CHECK (payee_minor > 0),
  fee_minor bigint NOT NULL CHECK (fee_minor >= 0),
  gst_minor bigint NOT NULL CHECK (gst_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor = payee_minor + fee_minor + gst_minor),
  state text NOT NULL CHECK (state IN (
    'CREATED', 'PAYMENT_PENDING', 'PAID', 'PAYOUT_QUEUED',
    'PAYOUT_PROCESSING', 'SUCCESS', 'FAILED', 'REFUND_INITIATED', 'REFUNDED'
  )),
  cashfree_session_id text,
  utr text,
  failure_code text,
  payout_provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xorpay_payments_user_created_idx
  ON xorpay_payments (user_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS xorpay_payments_state_created_idx
  ON xorpay_payments (state, created_at);

CREATE TABLE IF NOT EXISTS xorpay_ledger_entries (
  id bigserial PRIMARY KEY,
  payment_id text NOT NULL REFERENCES xorpay_payments(id),
  entry_kind text NOT NULL CHECK (entry_kind IN ('payment', 'payout', 'refund')),
  line_number smallint NOT NULL,
  account text NOT NULL CHECK (account IN ('collections', 'escrow', 'fee_revenue', 'gst_payable', 'payouts')),
  debit_minor bigint NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xorpay_ledger_one_side CHECK ((debit_minor = 0) <> (credit_minor = 0)),
  CONSTRAINT xorpay_ledger_line_unique UNIQUE (payment_id, entry_kind, line_number)
);
CREATE INDEX IF NOT EXISTS xorpay_ledger_payment_idx ON xorpay_ledger_entries (payment_id);

CREATE TABLE IF NOT EXISTS xorpay_webhook_events (
  provider text NOT NULL,
  event_key text NOT NULL,
  event_type text NOT NULL,
  payment_id text,
  payload_sha256 char(64) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  PRIMARY KEY (provider, event_key)
);

CREATE TABLE IF NOT EXISTS xorpay_payout_outbox (
  payment_id text PRIMARY KEY REFERENCES xorpay_payments(id),
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY', 'LEASED', 'DONE', 'DEAD')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xorpay_payout_outbox_ready_idx
  ON xorpay_payout_outbox (available_at, created_at)
  WHERE state IN ('READY', 'LEASED');

CREATE TABLE IF NOT EXISTS xorpay_beneficiaries (
  id text PRIMARY KEY,
  user_phone text NOT NULL,
  type text NOT NULL CHECK (type IN ('bank', 'upi')),
  masked_account text NOT NULL,
  encrypted_destination bytea NOT NULL,
  encryption_key_id text NOT NULL,
  ifsc text,
  registered_name text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_phone, id)
);
CREATE INDEX IF NOT EXISTS xorpay_beneficiaries_user_idx
  ON xorpay_beneficiaries (user_phone, created_at DESC);

CREATE TABLE IF NOT EXISTS xorpay_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
