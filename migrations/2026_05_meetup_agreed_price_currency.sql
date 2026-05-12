-- Persist the currency for agreed_price on each meetup so the value is
-- always interpreted in the right unit, regardless of who is viewing it.
-- Run once in Supabase SQL editor.

ALTER TABLE meetups
  ADD COLUMN IF NOT EXISTS agreed_price_currency text NOT NULL DEFAULT 'usd'
  CHECK (agreed_price_currency IN ('usd', 'clp'));
