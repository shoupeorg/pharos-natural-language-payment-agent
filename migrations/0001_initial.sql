CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  capability_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  instruction TEXT NOT NULL,
  clarifications_json TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  validation_json TEXT,
  review_json TEXT,
  unsigned_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
CREATE INDEX IF NOT EXISTS idx_drafts_workspace ON drafts(workspace_id, updated_at DESC);
