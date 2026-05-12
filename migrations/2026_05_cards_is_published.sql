-- Unify is_for_trade and is_for_sale into a single is_published flag.
-- Cards that were either for_trade or for_sale become is_published = true.
-- The old columns stay in the DB for backward compatibility but are no longer
-- read or written by the client.
-- Run once in Supabase SQL editor.

ALTER TABLE cards_collection
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

UPDATE cards_collection
  SET is_published = true
  WHERE is_for_trade = true OR is_for_sale = true;
