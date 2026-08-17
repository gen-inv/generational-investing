ALTER TABLE pending_research ADD COLUMN update_type TEXT NOT NULL DEFAULT 'new';
ALTER TABLE pending_research ADD COLUMN user_notes TEXT;

ALTER TABLE events ADD COLUMN event_key TEXT;

CREATE TABLE event_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    event_key TEXT NOT NULL,
    snapshot_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT NOT NULL,
    price_impact_pct REAL,
    management_acknowledged INTEGER,
    management_response TEXT,
    agent_recoverable_assessment TEXT,
    joint_determination TEXT,
    status TEXT,
    source_urls TEXT,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);