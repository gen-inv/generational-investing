ALTER TABLE pending_research ADD COLUMN meaning_question_num INTEGER DEFAULT 0;
ALTER TABLE pending_research ADD COLUMN question_sent_at DATETIME;
ALTER TABLE pending_research ADD COLUMN meaning_answer_1 TEXT;
ALTER TABLE pending_research ADD COLUMN meaning_answer_2 TEXT;
ALTER TABLE pending_research ADD COLUMN meaning_answer_3 TEXT;
ALTER TABLE pending_research ADD COLUMN meaning_answer_4 TEXT;