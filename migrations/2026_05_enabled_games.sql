-- Enabled games per profile — one-shot migration
-- Run once in Supabase SQL editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS enabled_games text[]
    NOT NULL
    DEFAULT ARRAY['pokemon','magic','yugioh','onepiece','digimon','lorcana','other']::text[];
