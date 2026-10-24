CREATE TABLE IF NOT EXISTS xorpay_otp_rate_limits (
  key_hash char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL,
  send_count integer NOT NULL CHECK (send_count BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xorpay_otp_rate_limits_updated_idx
  ON xorpay_otp_rate_limits(updated_at);
