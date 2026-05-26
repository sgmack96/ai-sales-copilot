-- D1 Schema for AI Sales Co-Pilot Audit Log
-- Run: wrangler d1 execute ai-sales-copilot-audit --file=./schema.sql

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  tools_used TEXT,
  latency_ms INTEGER,
  tokens_used INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_id ON agent_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_name ON agent_runs(agent_name);
CREATE INDEX IF NOT EXISTS idx_created_at ON agent_runs(created_at);

-- Example query: How many research agent runs in the last 24 hours?
-- SELECT COUNT(*) FROM agent_runs WHERE agent_name = 'research' AND created_at > datetime('now', '-1 day');
