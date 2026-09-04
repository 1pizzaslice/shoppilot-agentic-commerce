CREATE TABLE IF NOT EXISTS conversations (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('collecting', 'ready', 'recommendations_shown', 'product_selected', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_intents (
  conversation_id text PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sequence)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('collecting', 'ready', 'recommendations_shown', 'product_selected', 'cancelled')),
  event_count integer NOT NULL CHECK (event_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_events (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  type text NOT NULL CHECK (type IN ('model_call', 'tool_call', 'policy_decision')),
  name text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'completed', 'rejected')),
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_run_id, sequence)
);

CREATE INDEX IF NOT EXISTS conversation_messages_conversation_idx
  ON conversation_messages (conversation_id, sequence);
CREATE INDEX IF NOT EXISTS agent_runs_conversation_idx
  ON agent_runs (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS conversation_events_conversation_idx
  ON conversation_events (conversation_id, created_at);
