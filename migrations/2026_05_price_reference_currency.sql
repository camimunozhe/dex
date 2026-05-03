-- Price reference currency — track which currency a manually entered price is in.
-- Run once in Supabase SQL editor.

ALTER TABLE cards_collection
  ADD COLUMN IF NOT EXISTS price_reference_currency text NOT NULL DEFAULT 'usd';

-- Backfill existing rows with the owner's current display currency.
UPDATE cards_collection cc
SET price_reference_currency = COALESCE(p.currency, 'usd')
FROM profiles p
WHERE cc.user_id = p.id
  AND cc.price_reference IS NOT NULL;

ALTER TABLE cards_collection
  ADD CONSTRAINT cards_collection_price_reference_currency_check
  CHECK (price_reference_currency IN ('usd', 'clp'));
