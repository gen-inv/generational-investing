-- Migration: Add buy_price field to companies table
-- Description: Track the target buy price for each company in the watchlist

ALTER TABLE companies ADD COLUMN buy_price REAL;

-- Set default buy_price to NULL for existing companies (user can update later)
