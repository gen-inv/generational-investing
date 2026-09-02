CREATE TABLE fcf_trend_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    start_year TEXT NOT NULL,
    end_year TEXT NOT NULL,
    direction TEXT NOT NULL,  -- 'depressed' or 'elevated'
    deviation_pct REAL,
    flag_level TEXT NOT NULL,  -- 'soft' or 'hard'
    excludes_prior_trend INTEGER DEFAULT 0,  -- 1 if Kendry proposed (and Rob confirmed)
                                              -- that years before this period shouldn't
                                              -- factor into the trend basis at all
    kendry_findings TEXT,
    rob_response TEXT,
    status TEXT NOT NULL DEFAULT 'pending_confirmation',  -- pending_confirmation | confirmed | rejected
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

ALTER TABLE pending_research ADD COLUMN fcf_trend_question_sent_at DATETIME;