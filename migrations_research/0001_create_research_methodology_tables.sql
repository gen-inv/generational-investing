-- migrations/0031_create_research_methodology_tables.sql
-- Adds the Rule #1 research methodology on top of the existing raw-financials schema.
-- Existing tables (companies, income_statements, balance_sheets, cash_flow_statements,
-- key_metrics, dividends, stock_splits, cik_mapping) are untouched -- this is purely additive.

CREATE TABLE quick_five_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    status TEXT NOT NULL,                          -- active | disqualified
    disqualification_reason TEXT,
    debt_fcf_years REAL,
    debt_fcf_status TEXT,                          -- pass | soft_flag | hard_fail
    roic_avg REAL,
    roic_slope REAL,
    fcf_pct_earnings REAL,
    china_hq INTEGER,                              -- 0/1
    possible_bank INTEGER,                         -- 0/1
    understand_easily_notes TEXT,
    understand_destroyers_notes TEXT,
    overall_pass INTEGER,                          -- 0/1
    assessed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id)
);

CREATE TABLE quick_five_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    original_disqualification_reason TEXT,
    override_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE research_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL,                        -- 10-K | 10-Q | DEF14A | earnings-call | 8-K | deep-checklist | valuation | inversions | events
    filing_date TEXT,
    source_url TEXT,
    content TEXT NOT NULL,                         -- full markdown content
    abstract TEXT,                                 -- short summary, used for FTS
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id, doc_type, filing_date)
);

-- Full-text search over note abstracts, same pattern proven locally.
-- TEST IN LOCAL DEV FIRST (wrangler d1 migrations apply --local) before applying to prod --
-- D1 is SQLite-based and should support FTS5, but this is unverified in this specific environment.
CREATE VIRTUAL TABLE research_notes_fts USING fts5(
    company_id, doc_type, abstract, content='research_notes', content_rowid='id'
);

CREATE TABLE fgr_triangulation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    historical_cagr REAL,
    management_guidance REAL,
    segment_reasoning REAL,
    blended_fgr REAL NOT NULL,                     -- the bottom-up figure actually used
    weighting_rationale TEXT,
    analyst_commentary REAL,
    analyst_sources TEXT,
    gap_pct_points REAL,
    reconciliation_notes TEXT,                     -- required if gap > 3pp
    assessed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id)
);

CREATE TABLE valuations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    growth_classification TEXT,                    -- high-growth | stable
    fgr_used REAL,
    owner_earnings_price REAL,
    dfe_sticker REAL,
    dfe_buy_price REAL,
    payback_time_price REAL,
    avg_fcf_ratio REAL,
    weight_dfe REAL,
    weight_owner_earnings REAL,
    weight_payback REAL,
    blended_sticker REAL,
    blended_buy_price REAL,
    rop_wheel_ceiling REAL,
    current_price REAL,
    on_sale INTEGER,                               -- 0/1
    exit_pe_used REAL,
    exit_pe_override_applied INTEGER DEFAULT 0,
    exit_pe_override_justification TEXT,
    valuation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id)
);

CREATE TABLE scoresheet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    understanding_score REAL,
    moat_score REAL,
    management_score REAL,
    options_liquidity_score REAL,
    total_pct REAL,
    grade TEXT,                                    -- A+ | A | Below threshold
    fit_rating REAL,
    confidence_company REAL,
    confidence_industry REAL,
    values_alignment REAL,
    moat_strength REAL,
    moat_type REAL,
    pricing_power REAL,
    ceo_candor REAL,
    insider_activity REAL,
    fcf_deployment REAL,
    buyback_timing REAL,
    big_four_score REAL,
    conservative_financing_score REAL,
    roic_score REAL,
    guru_activity_score REAL,
    capital_intensity_score REAL,
    assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id)
);

CREATE TABLE anti_fragile_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    roic_score INTEGER,                            -- 0-4
    fgr_score INTEGER,
    net_debt_fcf_score INTEGER,
    inflation_resilience_score INTEGER,
    recession_resilience_score INTEGER,
    purchase_frequency_score INTEGER,
    discretionary_essential_score INTEGER,
    geopolitical_risk_score INTEGER,
    total_score INTEGER,                           -- 0-32
    assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id)
);

CREATE TABLE inversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    category TEXT NOT NULL,                        -- Management | Moat | Growth
    reason_to_own TEXT NOT NULL,
    bear_case TEXT NOT NULL,
    rebuttal TEXT NOT NULL,
    rebuttal_strength TEXT,                         -- e.g. Strong, Moderate, Thin/unresolved
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    identified_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    price_impact_pct REAL,
    management_acknowledged INTEGER,               -- 0/1
    management_response TEXT,
    agent_recoverable_assessment TEXT,
    joint_determination TEXT,                      -- filled in only after Rob weighs in
    status TEXT DEFAULT 'open',                    -- open | monitoring | resolved
    source_urls TEXT,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE guru_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    guru_name TEXT NOT NULL,
    filing_date TEXT,
    shares INTEGER,
    value REAL,
    implied_price REAL,
    pct_of_portfolio REAL,
    activity TEXT,                                  -- ADDED | REDUCED | NEW | EXITED | HELD_FLAT
    computed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE peer_comparisons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    peer_ticker TEXT NOT NULL,
    fiscal_year TEXT,
    revenue REAL,
    operating_income REAL,
    operating_margin REAL,
    avg_fcf_3yr REAL,
    net_debt_to_fcf_3yr REAL,
    avg_roic_5yr REAL,
    employees INTEGER,
    revenue_per_employee REAL,
    data_gaps TEXT,                                 -- honest notes on what couldn't be sourced
    computed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);