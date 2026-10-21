-- Discovery page: what the automatic scans (guru 13F purchases now, government contracts later) found and when they last ran.
CREATE TABLE IF NOT EXISTS discovery_scans (
  scan_type TEXT PRIMARY KEY,
  last_run_at TEXT NOT NULL,
  gurus_scanned INTEGER,
  candidates_found INTEGER,
  status TEXT,
  note TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discovery_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_type TEXT NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT,
  found_at TEXT NOT NULL,
  tier TEXT,
  status TEXT NOT NULL DEFAULT 'alerted',
  headline TEXT NOT NULL,
  details TEXT,
  data_json TEXT,
  source_key TEXT NOT NULL,
  UNIQUE (scan_type, source_key)
);

CREATE INDEX IF NOT EXISTS idx_discovery_findings_found ON discovery_findings (scan_type, found_at DESC);
