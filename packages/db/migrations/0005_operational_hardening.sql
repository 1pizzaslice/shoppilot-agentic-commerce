ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS correlation_id text NOT NULL DEFAULT 'legacy';
ALTER TABLE conversation_events
  ADD COLUMN IF NOT EXISTS correlation_id text NOT NULL DEFAULT 'legacy';
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS correlation_id text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS agent_runs_correlation_idx
  ON agent_runs (correlation_id, created_at);
CREATE INDEX IF NOT EXISTS conversation_events_correlation_idx
  ON conversation_events (correlation_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_correlation_idx
  ON audit_events (correlation_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_cart_metadata_idx
  ON audit_events ((metadata->>'cartId'), created_at);
CREATE INDEX IF NOT EXISTS payment_webhook_events_provider_order_idx
  ON payment_webhook_events (provider_order_id, received_at);
CREATE INDEX IF NOT EXISTS approvals_expiry_active_idx
  ON approvals (expires_at) WHERE used_at IS NULL AND invalidated_at IS NULL;
