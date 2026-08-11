CREATE TABLE pending_research (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    requested_by_user_id INTEGER,  -- informational only, main site's user id (different DB, no real FK)
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | disqualified
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    claimed_at DATETIME,
    completed_at DATETIME,
    notes TEXT
);

-- Same ticker can have historical rows (e.g. requeued after something changed), but
-- never two simultaneously-active pending/in_progress rows for the same ticker.
CREATE UNIQUE INDEX idx_pending_research_ticker_active ON pending_research(ticker)
    WHERE status IN ('pending', 'in_progress');