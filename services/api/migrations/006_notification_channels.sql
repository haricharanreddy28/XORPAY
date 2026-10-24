CREATE TABLE IF NOT EXISTS xorpay_notification_contacts (
  user_phone text PRIMARY KEY,
  email_hash char(64),
  email_ciphertext bytea,
  email_key_id text,
  email_verified_at timestamptz,
  email_otp_hash char(64),
  email_otp_expires_at timestamptz,
  email_otp_sent_at timestamptz,
  email_otp_window_started_at timestamptz,
  email_otp_send_count integer NOT NULL DEFAULT 0 CHECK (email_otp_send_count >= 0),
  email_otp_attempts integer NOT NULL DEFAULT 0 CHECK (email_otp_attempts >= 0),
  sms_notifications_enabled boolean NOT NULL DEFAULT false,
  email_notifications_enabled boolean NOT NULL DEFAULT false,
  push_notifications_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xorpay_notification_devices (
  token_hash char(64) PRIMARY KEY,
  user_phone text NOT NULL,
  token_ciphertext bytea NOT NULL,
  token_key_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android','ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE INDEX IF NOT EXISTS xorpay_notification_devices_user_idx
  ON xorpay_notification_devices(user_phone) WHERE disabled_at IS NULL;

CREATE TABLE IF NOT EXISTS xorpay_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone text NOT NULL,
  title varchar(120) NOT NULL,
  body varchar(2000) NOT NULL,
  type varchar(40) NOT NULL DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS xorpay_notifications_user_created_idx
  ON xorpay_notifications(user_phone,created_at DESC);
