-- Track which side of the trade is paying the agreed_price (nullable: only set
-- when there is a price). Makes the summary unambiguous about who offers
-- money in the deal.
-- Run once in Supabase SQL editor.

ALTER TABLE meetups
  ADD COLUMN IF NOT EXISTS agreed_price_payer text
  CHECK (agreed_price_payer IN ('proposer', 'receiver'));
