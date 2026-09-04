ALTER TABLE checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_state_check;
ALTER TABLE checkout_attempts ADD CONSTRAINT checkout_attempts_state_check
  CHECK (state IN ('authorized', 'creating', 'created', 'payment_pending', 'paid', 'failed', 'expired', 'cancelled'));

CREATE TABLE IF NOT EXISTS payment_orders (
  checkout_attempt_id text PRIMARY KEY REFERENCES checkout_attempts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('fake', 'razorpay')),
  provider_order_id text UNIQUE,
  provider_payment_id text UNIQUE,
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  state text NOT NULL CHECK (state IN ('creating', 'created', 'payment_pending', 'paid', 'failed', 'expired', 'cancelled')),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_checkout_attempt_id_fkey;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_checkout_attempt_id_fkey
  FOREIGN KEY (checkout_attempt_id) REFERENCES checkout_attempts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS payment_orders_provider_order_idx
  ON payment_orders (provider_order_id);
CREATE INDEX IF NOT EXISTS payment_orders_state_updated_idx
  ON payment_orders (state, updated_at);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  provider_order_id text,
  signature_verified boolean NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('processed', 'ignored', 'rejected')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_entity_type_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_entity_type_check
  CHECK (entity_type IN ('cart', 'addon_offer', 'approval', 'checkout', 'webhook'));
