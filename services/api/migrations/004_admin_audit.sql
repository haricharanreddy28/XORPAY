CREATE TABLE IF NOT EXISTS xorpay_admin_audit_log (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  actor_subject text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('super', 'ops', 'finance', 'support', 'compliance')),
  http_method text NOT NULL CHECK (http_method IN ('POST', 'PUT', 'PATCH', 'DELETE')),
  action text NOT NULL,
  resource_sha256 char(64),
  response_status integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS xorpay_admin_audit_actor_created_idx
  ON xorpay_admin_audit_log (actor_subject, started_at DESC);
CREATE INDEX IF NOT EXISTS xorpay_admin_audit_action_created_idx
  ON xorpay_admin_audit_log (action, started_at DESC);
