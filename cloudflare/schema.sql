CREATE TABLE IF NOT EXISTS monitor_snapshots (
  id INTEGER PRIMARY KEY,
  payload TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  source_checked_at INTEGER NOT NULL
);
