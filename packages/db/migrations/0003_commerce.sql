CREATE TABLE IF NOT EXISTS carts (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft', 'review', 'approved', 'checkout_started', 'terminal')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  budget_paise integer CHECK (budget_paise IS NULL OR budget_paise > 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carts_merchant_user_idx ON carts (merchant_id, user_id);

CREATE TABLE IF NOT EXISTS cart_lines (
  id text PRIMARY KEY,
  cart_id text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('primary', 'addon')),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, kind),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS addon_offers (
  id text PRIMARY KEY,
  cart_id text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  cart_version integer NOT NULL CHECK (cart_version > 0),
  source_product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id text NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  reason text NOT NULL,
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  outcome text CHECK (outcome IS NULL OR outcome IN ('accepted', 'declined', 'skipped')),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, cart_version)
);
CREATE INDEX IF NOT EXISTS addon_offers_cart_idx ON addon_offers (cart_id, created_at);

CREATE TABLE IF NOT EXISTS checkout_snapshots (
  id text PRIMARY KEY,
  cart_id text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  cart_version integer NOT NULL CHECK (cart_version > 0),
  hash text NOT NULL UNIQUE CHECK (hash ~ '^[a-f0-9]{64}$'),
  document jsonb NOT NULL,
  subtotal_paise integer NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise integer NOT NULL CHECK (discount_paise >= 0),
  tax_paise integer NOT NULL CHECK (tax_paise >= 0),
  delivery_paise integer NOT NULL CHECK (delivery_paise >= 0),
  total_paise integer NOT NULL CHECK (total_paise > 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, cart_version)
);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  cart_id text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  snapshot_id text NOT NULL UNIQUE REFERENCES checkout_snapshots(id) ON DELETE RESTRICT,
  cart_hash text NOT NULL CHECK (cart_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL,
  total_paise integer NOT NULL CHECK (total_paise > 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_cart_idx ON approvals (cart_id, created_at);

CREATE OR REPLACE FUNCTION reject_checkout_snapshot_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'checkout_snapshots is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS checkout_snapshots_no_update ON checkout_snapshots;
CREATE TRIGGER checkout_snapshots_no_update
BEFORE UPDATE ON checkout_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_checkout_snapshot_update();

CREATE TABLE IF NOT EXISTS policy_decisions (
  id text PRIMARY KEY,
  cart_id text NOT NULL,
  approval_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'rejected')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_decisions_cart_idx ON policy_decisions (cart_id, created_at);

CREATE TABLE IF NOT EXISTS checkout_attempts (
  id text PRIMARY KEY,
  cart_id text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  approval_id text NOT NULL UNIQUE REFERENCES approvals(id) ON DELETE CASCADE,
  policy_decision_id text NOT NULL REFERENCES policy_decisions(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state = 'authorized'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('cart', 'addon_offer', 'approval', 'checkout')),
  entity_id text NOT NULL,
  event_type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('completed', 'allowed', 'rejected', 'invalidated')),
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at);

CREATE OR REPLACE FUNCTION reject_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
