CREATE TABLE IF NOT EXISTS xorpay_kyc_profiles (
  user_phone text PRIMARY KEY,
  pan_verified boolean NOT NULL DEFAULT false,
  aadhaar_verified boolean NOT NULL DEFAULT false,
  selfie_verified boolean NOT NULL DEFAULT false,
  gst_verified boolean NOT NULL DEFAULT false,
  pan_ciphertext bytea,
  pan_key_id text,
  pan_masked text,
  gstin_ciphertext bytea,
  gstin_key_id text,
  gstin_masked text,
  legal_name text,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((pan_ciphertext IS NULL) = (pan_key_id IS NULL)),
  CHECK ((gstin_ciphertext IS NULL) = (gstin_key_id IS NULL))
);

CREATE TABLE IF NOT EXISTS xorpay_kyc_sessions (
  id bigserial PRIMARY KEY,
  user_phone text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('aadhaar', 'selfie')),
  session_sha256 char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xorpay_kyc_session_unique UNIQUE (user_phone, purpose, session_sha256)
);

CREATE INDEX IF NOT EXISTS xorpay_kyc_profiles_review_idx
  ON xorpay_kyc_profiles (review_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS xorpay_kyc_sessions_pending_idx
  ON xorpay_kyc_sessions (user_phone, purpose, expires_at)
  WHERE status = 'PENDING';
