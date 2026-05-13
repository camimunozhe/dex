-- Premium "Boost" flag for Explorar publications.
-- Boosted cards appear first in the Explorar grid.

ALTER TABLE cards_collection
  ADD COLUMN IF NOT EXISTS is_boosted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS cards_collection_is_boosted_idx
  ON cards_collection(is_boosted) WHERE is_boosted = true;
