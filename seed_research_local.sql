-- Seed local research database with MA (Mastercard) test data
-- This matches the production research database structure

-- Insert company
INSERT INTO companies (id, symbol, name, exchange, currency, sector, industry, last_updated, created_at)
VALUES (11, 'MA', 'Mastercard Incorporated', NULL, NULL, NULL, NULL, '2026-08-07 16:13:50', '2026-03-31 22:16:32');

-- Insert quick_five_results
INSERT INTO quick_five_results (id, company_id, status, disqualification_reason, debt_fcf_years, debt_fcf_status, roic_avg, roic_slope, fcf_pct_earnings, china_hq, possible_bank, understand_easily_notes, understand_destroyers_notes, overall_pass, assessed_date, created_at)
VALUES (2, 11, 'active', NULL, 0.59, 'pass', 0.8778, -0.0203, 1.085, 0, 0, 
'Payments processing network: revenue = transaction volume × take rate. Business model is legible without specialist knowledge.',
'Primary risks: regulatory interchange caps (Durbin-style legislation), a major card network displacement (real-time payment rails like UPI/PIX), or a systemic security/fraud event undermining trust in the network.',
1, '2026-08-07 16:13:50', '2026-08-07 16:13:50');

-- Insert valuation
INSERT INTO valuations (id, company_id, growth_classification, fgr_used, owner_earnings_price, dfe_sticker, dfe_buy_price, payback_time_price, avg_fcf_ratio, weight_dfe, weight_owner_earnings, weight_payback, blended_sticker, blended_buy_price, rop_wheel_ceiling, current_price, on_sale, exit_pe_used, exit_pe_override_applied, exit_pe_override_justification, valuation_date, notes)
VALUES (1, 11, 'high-growth', 0.12991635335100105, 230.85761589403972, NULL, 179.9527151842578, 278.9944424154779, 1.1719646804623318, 0.6, 0.3, 0.1, 313.0999872308691, 205.1283581203144, 250.47998978469528, 535, 0, 25.98327067020021, 0, NULL, '2026-08-07 16:13:51',
'FGR not provided -- defaulted to computed revenue CAGR (12.99%).');

-- Insert scoresheet
INSERT INTO scoresheet (id, company_id, understanding_score, moat_score, management_score, options_liquidity_score, total_pct, grade, fit_rating, confidence_company, confidence_industry, values_alignment, moat_strength, moat_type, pricing_power, ceo_candor, insider_activity, fcf_deployment, buyback_timing, big_four_score, conservative_financing_score, roic_score, guru_activity_score, capital_intensity_score, assessment_date)
VALUES (1, 11, 3.775, 4.45, 4.4892, 4, 83.571, 'A (tradeable via options)', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-07 16:13:51');

-- Insert anti_fragile_scores
INSERT INTO anti_fragile_scores (id, company_id, roic_score, fgr_score, net_debt_fcf_score, inflation_resilience_score, recession_resilience_score, purchase_frequency_score, discretionary_essential_score, geopolitical_risk_score, total_score, assessment_date)
VALUES (1, 11, 4, 3, 4, 3, 2, 4, 3, 3, 26, '2026-08-07 16:13:51');
